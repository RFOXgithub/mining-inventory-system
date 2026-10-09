import { Prisma } from "@prisma/client";
import { dateOnly } from "./schema";
const D = Prisma.Decimal;
D.set({ precision: 48 });
type Tax = { rate: string; calculation: "NONE" | "EXCLUSIVE" | "INCLUSIVE"; base: "ITEMS" | "ITEMS_FREIGHT"; rounding: "HALF_UP" | "DOWN" | "UP"; roundAt: "LINE" | "TOTAL" };
const rounding = { HALF_UP: D.ROUND_HALF_UP, DOWN: D.ROUND_DOWN, UP: D.ROUND_UP };
export function amount(v: Prisma.Decimal.Value) { const n = new D(v); if (!n.isFinite() || n.abs().gte("1e22") || n.decimalPlaces() > 2) throw new Error("Nilai uang melampaui presisi ledger."); return n; }
export function calculateInvoice(lines: { role: string; quantity: string; unitPrice: string }[], policy: Tax) {
  const round = (v: Prisma.Decimal) => v.toDecimalPlaces(2, rounding[policy.rounding]);
  const components = lines.map(l => ({ ...l, gross: round(new D(l.quantity).mul(l.unitPrice)) }));
  const gross = components.reduce((sum, l) => sum.plus(l.gross), new D(0));
  const taxable = components.filter(l => policy.base === "ITEMS_FREIGHT" || l.role === "ITEM");
  const base = taxable.reduce((sum, l) => sum.plus(l.gross), new D(0));
  const taxFor = (v: Prisma.Decimal) => policy.calculation === "NONE" ? new D(0) : policy.calculation === "INCLUSIVE" ? v.mul(policy.rate).div(new D(100).plus(policy.rate)) : v.mul(policy.rate).div(100);
  const tax = policy.roundAt === "LINE" ? taxable.reduce((sum, l) => sum.plus(round(taxFor(l.gross))), new D(0)) : round(taxFor(base));
  const subtotal = policy.calculation === "INCLUSIVE" ? gross.minus(tax) : gross, total = policy.calculation === "EXCLUSIVE" ? gross.plus(tax) : gross;
  return { lines: components.map(l => ({ ...l, amount: amount(l.gross).toString() })), gross: amount(gross).toString(), taxBase: base.toString(), subtotal: amount(subtotal).toString(), tax: amount(tax).toString(), total: amount(total).toString() };
}
export function settlement(total: string, allocated: string, pph: string) {
  const outstanding = new D(total).minus(allocated).minus(pph);
  if (outstanding.isNegative()) throw new Error("Allocation/PPh melebihi outstanding invoice.");
  return { outstanding: outstanding.toString(), paymentStatus: outstanding.isZero() ? "Paid" : new D(allocated).plus(pph).gt(0) ? "Partially Paid" : "Issued" };
}
export function dueDate(base: string, days: number) { dateOnly.parse(base); const d = new Date(`${base}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function aging(due: string | null, asOf: string) {
  dateOnly.parse(asOf); if (!due) return { days: null, bucket: "EXCEPTION_MISSING_DUE_DATE" };
  dateOnly.parse(due); const days = Math.round((Date.parse(asOf) - Date.parse(due)) / 86400000);
  return { days, bucket: days < 0 ? "Belum Jatuh Tempo" : days === 0 ? "Jatuh Tempo Hari Ini" : days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : ">90" };
}
export function localDay(date: Date | string) { return new Date(new Date(date).getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function asOfEnd(day: string) { dateOnly.parse(day); return new Date(Date.parse(`${day}T00:00:00+07:00`) + 86400000); }
