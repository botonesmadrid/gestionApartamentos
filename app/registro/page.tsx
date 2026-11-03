import type { Metadata } from "next";
import BuscarReserva from "./BuscarReserva";

export const metadata: Metadata = {
  title: "Registro de huéspedes · Botones",
  robots: { index: false, follow: false },
};

// Enlace general del formulario de huéspedes: el mismo para todas las reservas (plantillas de Booking, Airbnb…).
// Admite ?reserva=<número>&entrada=<AAAA-MM-DD> para rellenar los campos.
export default function Page({ searchParams }: { searchParams: { reserva?: string; entrada?: string } }) {
  return <BuscarReserva codigoInicial={searchParams.reserva ?? ""} entradaInicial={searchParams.entrada ?? ""} />;
}
