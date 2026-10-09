import { Prisma } from "@prisma/client";
const D = Prisma.Decimal;
D.set({ precision: 48 });
export function remaining(ordered: string, realized: string, proposed = "0") {
  const result = new D(ordered).minus(realized).minus(proposed);
  if (result.isNegative()) throw new Error("Over-delivery ditolak. Amendment PO harus approved sebelum pengiriman dilanjutkan.");
  return result.toString();
}
export function lineAmount(quantity: string, price: string) { return new D(quantity).mul(price).toDecimalPlaces(2, D.ROUND_HALF_UP).toString(); }
export function freightAmount(basis: string, rate: string, trips: number, units: string) {
  return basis === "NONE" ? "0" : lineAmount(basis === "PER_TRIP" ? String(trips) : units, rate);
}
