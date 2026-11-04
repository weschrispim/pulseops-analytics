export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

const integer = new Intl.NumberFormat("pt-BR");
const hours = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatHours(value: number | null): string {
  if (value === null) return "—";
  return `${hours.format(value)} h`;
}

/** Rate is a fraction (0.552 → 55,2%). */
export function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${percent.format(rate * 100)}%`;
}

/** Civil date YYYY-MM-DD, without shifting through a timezone. */
export function formatCivil(civilDate: string): string {
  const [year, month, day] = civilDate.split("-");
  if (!year || !month || !day) return civilDate;
  return `${day}/${month}/${year}`;
}

export function formatInstant(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
