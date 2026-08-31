"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function cerrarSesion() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function crearApartamento(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clienteNombre = String(formData.get("cliente") ?? "").trim();
  let clienteId: string | null = null;

  if (clienteNombre) {
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("nombre", clienteNombre)
      .maybeSingle();

    if (existente) {
      clienteId = existente.id;
    } else {
      const { data: nuevo, error: errorCliente } = await supabase
        .from("clientes")
        .insert({ nombre: clienteNombre })
        .select("id")
        .single();
      if (errorCliente) throw new Error(errorCliente.message);
      clienteId = nuevo.id;
    }
  }

  const { error } = await supabase.from("apartamentos").insert({
    gestor_id: user.id,
    apartamento: String(formData.get("apartamento") ?? ""),
    piso: String(formData.get("piso") ?? "") || null,
    codigo_establecimiento: String(formData.get("codigo_establecimiento") ?? "") || null,
    num_registro: String(formData.get("num_registro") ?? "") || null,
    cliente_id: clienteId,
    cru: String(formData.get("cru") ?? "") || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function crearReserva(apartamentoId: string, formData: FormData) {
  const supabase = createClient();

  const num = (v: FormDataEntryValue | null) =>
    v === null || v === "" ? null : Number(v);
  const str = (v: FormDataEntryValue | null) =>
    v === null || v === "" ? null : String(v);

  const { error } = await supabase.from("reservas").insert({
    apartamento_id: apartamentoId,
    fecha_reserva: str(formData.get("fecha_reserva")),
    fecha_entrada: str(formData.get("fecha_entrada")),
    fecha_salida: str(formData.get("fecha_salida")),
    nombre: String(formData.get("nombre") ?? ""),
    apellido1: str(formData.get("apellido1")),
    apellido2: str(formData.get("apellido2")),
    importe: num(formData.get("importe")),
    comision_portal: num(formData.get("comision_portal")),
    codigo_reserva: str(formData.get("codigo_reserva")),
    origen_reserva: str(formData.get("origen_reserva")),
    fecha_pago: str(formData.get("fecha_pago")),
    forma_pago: str(formData.get("forma_pago")),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/apartamentos/${apartamentoId}`);
  redirect(`/apartamentos/${apartamentoId}`);
}

export async function crearHuesped(
  apartamentoId: string,
  reservaId: string,
  formData: FormData
) {
  const supabase = createClient();
  const str = (v: FormDataEntryValue | null) =>
    v === null || v === "" ? null : String(v);

  const { error } = await supabase.from("huespedes").insert({
    reserva_id: reservaId,
    nombre: String(formData.get("nombre") ?? ""),
    apellido1: str(formData.get("apellido1")),
    apellido2: str(formData.get("apellido2")),
    fecha_nacimiento: str(formData.get("fecha_nacimiento")),
    soporte_documento: str(formData.get("soporte_documento")),
    numero_documento: str(formData.get("numero_documento")),
    direccion: str(formData.get("direccion")),
    codigo_postal: str(formData.get("codigo_postal")),
    nombre_municipio: str(formData.get("nombre_municipio")),
    telefono: str(formData.get("telefono")),
    correo: str(formData.get("correo")),
    tipo_documento: str(formData.get("tipo_documento")),
    rol: str(formData.get("rol")),
    nacionalidad: str(formData.get("nacionalidad")),
    sexo: str(formData.get("sexo")),
    parentesco: str(formData.get("parentesco")),
    codigo_municipio: str(formData.get("codigo_municipio")),
    pais: str(formData.get("pais")),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/apartamentos/${apartamentoId}/reservas/${reservaId}`);
  redirect(`/apartamentos/${apartamentoId}/reservas/${reservaId}`);
}
