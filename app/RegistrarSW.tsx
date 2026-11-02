"use client";

import { useEffect } from "react";

// Registra el service worker de la web app (instalable en el móvil, página sin conexión).
export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
