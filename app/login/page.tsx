"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "enviando" | "enviado" | "error">("idle");

  async function enviarEnlace(e: React.FormEvent) {
    e.preventDefault();
    setStatus("enviando");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setStatus(error ? "error" : "enviado");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Apartamentos
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Accede con tu correo. Te mandamos un enlace, sin contraseña.
        </p>

        {status === "enviado" ? (
          <p className="mt-8 rounded-md border border-line bg-white p-4 text-sm">
            Revisa <span className="font-medium">{email}</span> y pulsa el enlace para entrar.
          </p>
        ) : (
          <form onSubmit={enviarEnlace} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email">Correo</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>
            <button
              type="submit"
              disabled={status === "enviando"}
              className="w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
            >
              {status === "enviando" ? "Enviando…" : "Enviar enlace de acceso"}
            </button>
            {status === "error" && (
              <p className="text-sm text-clay">
                No se ha podido enviar el enlace. Inténtalo de nuevo.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
