import { redirect } from "next/navigation";
import { MAESTROS } from "./config";

// Sin menú intermedio: se abre directamente la primera pestaña.
export default function MaestrosIndexPage() {
  redirect(`/admin/maestros/${MAESTROS[0].slug}`);
}
