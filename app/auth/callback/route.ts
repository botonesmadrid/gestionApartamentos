"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Modo = "enlace" | "password";

export default function LoginPage() {
  const [modo, setModo] = useState<Modo>("enlace");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [recuperar, setRecuperar] = useState<"idle" | "enviando" | "enviado" | "error">("idle");

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
    if (error) {
      console.error("Error signInWithOtp:", error);
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("enviado");
    }
  }

  async function entrarConPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("enviando");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Error signInWithPassword:", error);
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      window.location.href = "/";
    }
  }

  async function establecerContrasena() {
    if (!email) {
      setErrorMsg("Escribe primero tu correo arriba.");
      setStatus("error");
      return;
    }
    setRecuperar("enviando");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/cuenta/nueva-password`,
    });
    setRecuperar(error ? "error" : "enviado");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Apartamentos
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {modo === "enlace"
            ? "Accede con tu correo. Te mandamos un enlace, sin contraseña."
            : "Accede con tu correo y contraseña."}
        </p>

        <div className="mt-6 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setModo("enlace");
              setStatus("idle");
              setErrorMsg("");
            }}
            className={`rounded-md px-3 py-1.5 ${
              modo === "enlace" ? "bg-ink text-paper" : "border border-line text-ink/70"
            }`}
          >
            Enlace por email
          </button>
          <button
            type="button"
            onClick={() => {
              setModo("password");
              setStatus("idle");
              setErrorMsg("");
            }}
            className={`rounded-md px-3 py-1.5 ${
              modo === "password" ? "bg-ink text-paper" : "border border-line text-ink/70"
            }`}
          >
            Usuario y contraseña
          </button>
        </div>

        {modo === "enlace" ? (
          status === "enviado" ? (
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
                  No se ha podido enviar el enlace: {errorMsg || "inténtalo de nuevo."}
                </p>
              )}
            </form>
          )
        ) : (
          <form onSubmit={entrarConPassword} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email-password">Correo</label>
              <input
                id="email-password"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>
            <div>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={status === "enviando"}
              className="w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
            >
              {status === "enviando" ? "Entrando…" : "Entrar"}
            </button>
            {status === "error" && (
              <p className="text-sm text-clay">
                No se ha podido entrar: {errorMsg || "revisa tus datos."}
              </p>
            )}

            <div className="border-t border-line pt-4 text-sm">
              {recuperar === "enviado" ? (
                <p>
                  Te hemos enviado un correo a <span className="font-medium">{email}</span> para
                  establecer tu contraseña.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={establecerContrasena}
                  disabled={recuperar === "enviando"}
                  className="text-ink/70 underline hover:text-ink disabled:opacity-50"
                >
                  {recuperar === "enviando"
                    ? "Enviando…"
                    : "¿No tienes contraseña o la has olvidado? Establécela por email"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
