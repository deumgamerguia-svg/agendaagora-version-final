export const CATEGORIES = [
  { value: "barbearia", label: "Barbearia" },
  { value: "salao", label: "Salão de beleza" },
  { value: "consultorio", label: "Consultório / Clínica" },
  { value: "estetica", label: "Estética" },
  { value: "pet", label: "Pet shop" },
  { value: "outro", label: "Outro" },
];

export const STATUSES = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "bloqueado", label: "Bloqueado" },
];

export function statusLabel(value: string) {
  return STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLong(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Combina data (YYYY-MM-DD) e hora (HH:MM) locais em ISO. */
export function localToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function addMinutesIso(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda - feira" },
  { value: 2, label: "Terça - feira" },
  { value: 3, label: "Quarta - feira" },
  { value: 4, label: "Quinta - feira" },
  { value: 5, label: "Sexta - feira" },
  { value: 6, label: "Sábado" },
];

export function weekdayLabel(value: number) {
  return WEEKDAYS.find((d) => d.value === value)?.label ?? String(value);
}

/** "2026-09-01" -> "09/26" */
export function formatMonthShort(date: string) {
  const [y, m] = date.split("-");
  return `${m}/${y?.slice(2)}`;
}

export function hhmm(value: string) {
  return value.slice(0, 5);
}

export function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
