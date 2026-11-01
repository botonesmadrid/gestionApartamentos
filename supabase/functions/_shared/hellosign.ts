// Lectura de los correos "<Firmante> firmó <Título>" de Dropbox Sign (HelloSign).
//   Asunto: "Herbert Riband firmó El  Botones Barco Herbert"
//   Cuerpo: "... Documento: El Botones Barco Herbert  Firmado: Herbert Riband (hfriband@gmail.com) ..."
//   Adjunto: el PDF firmado.

export interface FirmaHelloSign {
  firmante: string | null;
  email: string | null;
  titulo: string | null;
}

export function leerFirmaHelloSign(asunto: string, cuerpo: string): FirmaHelloSign {
  const a = asunto.replace(/\s+/g, " ").trim();
  const m = a.match(/^(.*?)\s+(?:firmó|ha firmado|signed|has signed)\s+(.*)$/i);
  const texto = cuerpo.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const f = texto.match(/(?:Firmado|Firmante|Signed by|Signer)s?:?\s*(.+?)\s*\(([^()\s@]+@[^()\s]+)\)/i);
  const doc = texto.match(/(?:Documento|Document):?\s*(.+?)\s+(?:Firmado|Firmante|Signed|Signer)/i);
  return {
    firmante: f?.[1]?.trim() ?? m?.[1]?.trim() ?? null,
    email: f?.[2]?.trim().toLowerCase() ?? null,
    titulo: m?.[2]?.trim() ?? doc?.[1]?.trim() ?? null,
  };
}
