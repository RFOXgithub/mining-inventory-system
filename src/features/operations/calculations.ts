import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;
D.set({ precision: 48 });
export function exactStockQuantity(quantity: string, factor: string) {
  const result = new D(quantity).mul(factor);
  if (result.decimalPlaces() > 6 || result.abs().gte("1000000000000000000")) throw new Error("Hasil konversi melampaui presisi UOM stok; koreksi quantity/metode ukur.");
  return result;
}
export function fuelKpi(liters: string, output: string) {
  return new D(output).isZero() ? { ratio: null, exception: "Output nol: N/A" } : { ratio: new D(liters).div(output).toDecimalPlaces(6).toString(), exception: null };
}
export function standardFactor(from: string, to: string): string | undefined {
  if (from === to) return "1";
  return ({ "KG:TON": "0.001", "TON:KG": "1000", "L:M3": "0.001", "M3:L": "1000" } as Record<string, string>)[`${from}:${to}`];
}
