import { redirect } from "next/navigation";

// Entradas ahora vive en la raíz ("/"). Esta ruta se mantiene solo por si
// hay enlaces guardados apuntando a /entradas.
export default function EntradasRedirect() {
  redirect("/");
}
