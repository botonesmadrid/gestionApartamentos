"use client";

// Verificación en dos pasos (MFA) obligatoria para entrar en la app.
// - Primera vez: se registra una app de autenticación (Google Authenticator, 1Password, Authy…) escaneando el QR.
// - Siguientes veces: se pide el código de 6 dígitos que muestra la app.
// Hasta verificar, la sesión es de nivel aal1: el proxy no deja pasar a la app y la base de datos no devuelve datos.
// Si alguien pierde el móvil, un administrador borra su factor en Supabase → Authentication → Users → (usuario).

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Estado =
  | { fase: "cargando" }
  | { fase: "alta"; factorId: string; qr: string; secreto: string }
  | { fase: "codigo"; factorId: string }
  | { fase: "error"; mensaje: string };

export default function VerificacionPage() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function preparar() {
      const supabase = createClient();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return irALaApp();

      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setEstado({ fase: "error", mensaje: error.message });
      const verificado = data.totp.find((f) => f.status === "verified");
      if (verificado) return setEstado({ fase: "codigo", factorId: verificado.id });

      // Alta: se borran los intentos de alta sin terminar y se crea uno nuevo.
      for (const f of data.all.filter((x) => x.factor_type === "totp" && x.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const alta = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "App de autenticación" });
      if (alta.error) return setEstado({ fase: "error", mensaje: alta.error.message });
      setEstado({ fase: "alta", factorId: alta.data.id, qr: alta.data.totp.qr_code, secreto: alta.data.totp.secret });
    }
    preparar();
  }, []);

  function irALaApp() {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (estado.fase !== "alta" && estado.fase !== "codigo") return;
    setEnviando(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: estado.factorId, code: codigo.trim() });
    setEnviando(false);
    if (error) {
      setError("El código no es correcto o ha caducado. Prueba con el código que aparece ahora en la app.");
      setCodigo("");
      return;
    }
    irALaApp();
  }

  async function salir() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Verificación en dos pasos</h1>

        {estado.fase === "cargando" && <p className="mt-4 text-sm text-ink/60">Cargando…</p>}

        {estado.fase === "error" && (
          <p className="mt-4 rounded-md bg-clay/10 p-3 text-sm text-clay">
            No se ha podido preparar la verificación: {estado.mensaje}
          </p>
        )}

        {estado.fase === "alta" && (
          <div className="mt-4 space-y-3 text-sm text-ink/70">
            <p>
              Para proteger los datos de los huéspedes, la app pide un segundo código además de la contraseña. Hazlo una
              sola vez:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Instala en tu móvil una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
              <li>En la app, añade una cuenta y escanea este código:</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={estado.qr} alt="Código QR para la app de autenticación" className="mx-auto h-48 w-48 rounded bg-white p-2" />
            <details className="text-xs">
              <summary className="cursor-pointer text-ink/60 underline">No puedo escanear el código</summary>
              <p className="mt-1">
                Introduce esta clave a mano en la app: <code className="break-all font-mono text-ink">{estado.secreto}</code>
              </p>
            </details>
            <p>3. Escribe el código de 6 dígitos que aparece en la app:</p>
          </div>
        )}

        {estado.fase === "codigo" && (
          <p className="mt-4 text-sm text-ink/70">Escribe el código de 6 dígitos que muestra tu app de autenticación.</p>
        )}

        {(estado.fase === "alta" || estado.fase === "codigo") && (
          <form onSubmit={verificar} className="mt-3 space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-md border border-line px-3 py-2 text-center font-mono text-lg tracking-[0.4em]"
              placeholder="000000"
              aria-label="Código de 6 dígitos"
            />
            {error && <p className="text-sm text-clay">{error}</p>}
            <button
              type="submit"
              disabled={enviando || codigo.length !== 6}
              className="w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
            >
              {enviando ? "Comprobando…" : "Verificar"}
            </button>
          </form>
        )}

        <button type="button" onClick={salir} className="mt-6 text-xs text-ink/60 underline">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
