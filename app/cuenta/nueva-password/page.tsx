"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NuevaPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [status, setStatus] = useState<"idle" | "guardando" | "guardado" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmar) {
      setErrorMsg("Las contraseñas no coinciden.");
      setStatus("error");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Usa al menos 8 caracteres.");
      setStatus("error");
      return;
    }
    setStatus("guardando");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
    } else {
      setStatus("guardado");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Establecer contraseña
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Elige la contraseña que usarás a partir de ahora para entrar.
        </p>

        {status === "guardado" ? (
          <p className="mt-8 rounded-md border border-line bg-white p-4 text-sm">
            Contraseña guardada. Entrando…
          </p>
        ) : (
          <form onSubmit={guardar} className="mt-8 space-y-4">
            <div>
              <label htmlFor="password">Nueva contraseña</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label htmlFor="confirmar">Repite la contraseña</label>
              <input
                id="confirmar"
                type="password"
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={status === "guardando"}
              className="w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
            >
              {status === "guardando" ? "Guardando…" : "Guardar contraseña"}
            </button>
            {status === "error" && (
              <p className="text-sm text-clay">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
