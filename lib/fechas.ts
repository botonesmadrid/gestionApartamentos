// Formato de fechas de toda la app: día-mes-año (16-11-2026) y, con hora, "16-11-2026 14:05" (hora local).
export function fechaDMA(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export function fechaHoraDMA(iso: string | null | undefined): string {
  if (!iso) return "—";
  const f = new Date(iso);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(f.getDate())}-${dd(f.getMonth() + 1)}-${f.getFullYear()} ${dd(f.getHours())}:${dd(f.getMinutes())}`;
}
