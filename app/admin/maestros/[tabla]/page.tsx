import { notFound } from "next/navigation";
import { buscarMaestro } from "../config";
import MaestroCrud from "../MaestroCrud";

// El control de acceso (solo gestores) y las pestañas están en ../layout.tsx.
export default async function MaestroPage(props: { params: Promise<{ tabla: string }> }) {
  const params = await props.params;
  const config = buscarMaestro(params.tabla);
  if (!config) notFound();

  return <MaestroCrud key={config.slug} config={config} />;
}
