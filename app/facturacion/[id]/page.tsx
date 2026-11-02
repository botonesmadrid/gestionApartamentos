import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FacturaDetalle from "./FacturaDetalle";

export default async function FacturaPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <FacturaDetalle id={params.id} />
    </main>
  );
}
