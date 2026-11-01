// Utilidades de Google (Drive, Docs, Gmail) compartidas por las Edge Functions.
// Usan el mismo OAuth de hola@botonesmadrid.com: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.

export const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const FOLDER = "application/vnd.google-apps.folder";

export async function tokenGoogle(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`OAuth Google: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

export class Google {
  constructor(private token: string) {}
  async req(url: string, init: RequestInit = {}) {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(`Google ${init.method ?? "GET"} ${url.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r;
  }
  async carpeta(padre: string, nombre: string): Promise<string> {
    const q = `name='${nombre.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${padre}' in parents and mimeType='${FOLDER}' and trashed=false`;
    const l = await (await this.req(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    )).json();
    if (l.files?.length) return l.files[0].id;
    const c = await (await this.req("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, mimeType: FOLDER, parents: [padre] }),
    })).json();
    return c.id;
  }
  async copiar(id: string, nombre: string, padre: string): Promise<string> {
    const c = await (await this.req(`https://www.googleapis.com/drive/v3/files/${id}/copy?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, parents: [padre] }),
    })).json();
    return c.id;
  }
  async marcadores(docId: string): Promise<string[]> {
    const d = await (await this.req(`https://docs.googleapis.com/v1/documents/${docId}`)).json();
    let texto = "";
    const rec = (els: any[]) =>
      els?.forEach((e) => {
        e.paragraph?.elements?.forEach((x: any) => (texto += x.textRun?.content ?? ""));
        e.table?.tableRows?.forEach((r: any) => r.tableCells?.forEach((c: any) => rec(c.content)));
      });
    rec(d.body?.content ?? []);
    Object.values(d.headers ?? {}).forEach((h: any) => rec(h.content));
    Object.values(d.footers ?? {}).forEach((h: any) => rec(h.content));
    return [...new Set((texto.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/gi) ?? []).map((m) => m.replace(/[{}\s]/g, "").toUpperCase()))];
  }
  async reemplazar(docId: string, valores: Record<string, string>) {
    const requests = Object.entries(valores).map(([k, v]) => ({
      replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: v },
    }));
    if (!requests.length) return;
    await this.req(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  }
  async exportarPdf(id: string): Promise<Uint8Array> {
    const r = await this.req(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async subirPdf(nombre: string, padre: string, pdf: Uint8Array): Promise<{ id: string; webViewLink: string }> {
    const frontera = `b_${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name: nombre, parents: [padre], mimeType: "application/pdf" });
    const enc = new TextEncoder();
    const partes = [
      enc.encode(`--${frontera}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${frontera}\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      enc.encode(`\r\n--${frontera}--`),
    ];
    const cuerpo = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of partes) {
      cuerpo.set(p, o);
      o += p.length;
    }
    return await (await this.req(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${frontera}` }, body: cuerpo },
    )).json();
  }
  // Carpeta de una reserva: <raíz>/CONTRATOS DE ALQUILER <año>/<MM>.- <MES>/<DD>_<Nombre_Apellidos>_<piso>
  async carpetaReserva(raiz: string, fechaEntrada: string, nombreCompleto: string, piso: string): Promise<string> {
    const [y, m, d] = fechaEntrada.split("-");
    const anio = await this.carpeta(raiz, `CONTRATOS DE ALQUILER ${y}`);
    const mes = await this.carpeta(anio, `${m}.- ${MESES[Number(m) - 1]}`);
    return await this.carpeta(mes, `${d}_${nombreCompleto}_${piso}`);
  }
  async adjuntoGmail(mensajeId: string, adjuntoId: string): Promise<Uint8Array> {
    const r = await (await this.req(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mensajeId}/attachments/${adjuntoId}`,
    )).json();
    const bin = atob(String(r.data).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  async papelera(id: string) {
    await this.req(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
}

// --- Formatos (como en el Apps Script) ---------------------------------------
export const ddmmyyyy = (iso: string | null, sep = "/") => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}${sep}${m}${sep}${y}`;
};
export const hoyMadrid = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD
export const euros = (n: number | null) =>
  n == null ? "" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const limpiarNombre = (s: string) => s.replace(/[\/\\?%*:|"<>.]/g, "_").replace(/\s+/g, "_");


// Titular de una reserva: el marcado; si no, el huésped cuyo nombre coincide con el de la reserva; si no, el primero.
export const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// deno-lint-ignore no-explicit-any
export function titularDe(r: any): any {
  // deno-lint-ignore no-explicit-any
  const hs = [...(r.huespedes ?? [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
  const marcado = hs.find((h) => h.id === r.titular_huesped_id);
  if (marcado) return marcado;
  const nombreReserva = normalizar([r.nombre, r.apellido1].filter(Boolean).join(" "));
  const porNombre = hs.find((h) => {
    const n = normalizar(h.nombre);
    const a = normalizar(h.apellido1);
    return n && nombreReserva.includes(n) && (!a || nombreReserva.includes(a) || !r.apellido1);
  });
  return porNombre ?? hs[0];
}
