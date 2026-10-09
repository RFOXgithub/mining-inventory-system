import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class DomainError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function domainResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ message: "Data tidak valid.", errors: error.flatten().fieldErrors }, { status: 422 });
  if (error instanceof DomainError) return NextResponse.json({ message: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return NextResponse.json({ message: "Kode atau versi sudah digunakan." }, { status: 409 });
  if (code === "P2034") return NextResponse.json({ message: "Data berubah bersamaan. Muat ulang sebelum mencoba lagi." }, { status: 409 });
  if (code === "P2028") return NextResponse.json({ message: "Transaksi dibatalkan karena koneksi terlalu lambat. Input tetap dapat dicoba ulang." }, { status: 503 });
  if (code === "P2003") return NextResponse.json({ message: "Referensi data tidak valid atau masih digunakan." }, { status: 422 });
  console.error("foundation.request", { code: code ?? "UNKNOWN" });
  return NextResponse.json({ message: "Permintaan tidak dapat diproses." }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new DomainError(403, "Asal permintaan tidak valid. Muat ulang halaman.");
}
