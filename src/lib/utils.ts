import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const toISODate = (d: Date) => format(d, "yyyy-MM-dd");
export const parseDate = (s: string) => parseISO(s.length === 10 ? `${s}T12:00:00` : s);
export const fmtDate = (s: string | Date, pattern = "dd/MM/yyyy") =>
  format(typeof s === "string" ? parseDate(s) : s, pattern, { locale: ptBR });
export const fmtRelative = (s: string) => formatDistanceToNow(parseISO(s), { locale: ptBR, addSuffix: true });
export const fmtNumber = (n: number) => new Intl.NumberFormat("pt-BR", { notation: n >= 10000 ? "compact" : "standard" }).format(n);
export const fmtCurrency = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
export const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export const uid = () => crypto.randomUUID();

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** Estimativa de duração falada (~2,4 palavras/segundo). */
export const estimateSeconds = (text: string) =>
  Math.round(text.split(/\s+/).filter((w) => w && !w.startsWith("[")).length / 2.4);
