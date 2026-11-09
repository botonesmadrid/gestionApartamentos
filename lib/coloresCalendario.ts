// Colores de los eventos de Google Calendar (colorId 1-11). Cada cliente tiene uno (clientes.color_calendario) y la app
// lo usa tal cual, para que la app y Calendar sigan el mismo patrón. Acuerdo (CM) rojo · Chueca morado · Barco azul.
export const COLORES_CALENDARIO: Record<number, { nombre: string; hex: string }> = {
  11: { nombre: "Rojo (tomate)", hex: "#d50000" },
  4: { nombre: "Rosa (flamenco)", hex: "#e67c73" },
  6: { nombre: "Naranja (mandarina)", hex: "#f4511e" },
  5: { nombre: "Amarillo (plátano)", hex: "#f6bf26" },
  2: { nombre: "Verde claro (salvia)", hex: "#33b679" },
  10: { nombre: "Verde (albahaca)", hex: "#0b8043" },
  7: { nombre: "Azul claro (pavo real)", hex: "#039be5" },
  9: { nombre: "Azul (arándano)", hex: "#3f51b5" },
  1: { nombre: "Lila (lavanda)", hex: "#7986cb" },
  3: { nombre: "Morado (uva)", hex: "#8e24aa" },
  8: { nombre: "Gris (grafito)", hex: "#616161" },
};
// Clientes sin color: el color por defecto del calendario.
export const COLOR_SIN_ASIGNAR = "#94a3b8";

export const hexCliente = (color: number | null | undefined) =>
  (color != null && COLORES_CALENDARIO[color]?.hex) || COLOR_SIN_ASIGNAR;

export const OPCIONES_COLOR = Object.entries(COLORES_CALENDARIO).map(([valor, c]) => ({ valor, etiqueta: c.nombre }));
