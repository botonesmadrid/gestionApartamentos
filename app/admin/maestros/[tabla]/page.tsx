import { notFound } from "next/navigation";
import { buscarMaestro } from "../config";
import MaestroCrud from "../MaestroCrud";

// El control de acceso (solo gestores) y las pestañas están en ../layout.tsx.
export default function MaestroPage({ params }: { params: { tabla: string } }) {
  const config = buscarMaestro(params.tabla);
  if (!config) notFound();

  return <MaestroCrud key={config.slug} config={config} />;
}
