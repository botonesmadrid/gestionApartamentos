import type { Metadata } from "next";
import FormularioHuespedes from "./FormularioHuespedes";

export const metadata: Metadata = {
  title: "Registro de huéspedes · Botones",
  robots: { index: false, follow: false },
};

export default async function Page(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <FormularioHuespedes token={params.token} />;
}
