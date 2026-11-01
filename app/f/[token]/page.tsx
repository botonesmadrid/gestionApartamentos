import type { Metadata } from "next";
import FormularioHuespedes from "./FormularioHuespedes";

export const metadata: Metadata = {
  title: "Registro de huéspedes · Botones",
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: { token: string } }) {
  return <FormularioHuespedes token={params.token} />;
}
