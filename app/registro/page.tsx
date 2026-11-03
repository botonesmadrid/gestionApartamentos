import type { Metadata } from "next";
import FormularioRegistro from "./FormularioRegistro";

export const metadata: Metadata = {
  title: "Registro de huéspedes · Botones",
  robots: { index: false, follow: false },
};

// Enlace único del formulario de huéspedes, el mismo para todas las reservas y propiedades (plantillas de los portales).
export default function Page() {
  return <FormularioRegistro />;
}
