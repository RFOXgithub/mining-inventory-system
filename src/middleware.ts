import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { DEVELOPMENT_AUTH_SECRET } from "@/lib/demo-auth";

const publicPaths = ["/login", "/api/auth/login"];
function authSecret() {
  const configured = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("AUTH_SECRET wajib diisi dengan minimal 32 karakter pada environment production.");
  }
  return configured || DEVELOPMENT_AUTH_SECRET;
}
export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) {
    const message = "Konfigurasi server tidak lengkap: AUTH_SECRET wajib berisi minimal 32 karakter.";
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ message }, { status: 500 });
    return new NextResponse(message, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (publicPaths.some((path) => request.nextUrl.pathname.startsWith(path)) || ["/draft-worker.js", "/manifest.webmanifest", "/draft-icon.svg", "/offline.html"].includes(request.nextUrl.pathname)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ message: "Asal permintaan tidak valid." }, { status: 403 });
  }
  const token = request.cookies.get("quarryflow_session")?.value;
  if (token) {
    try { await jwtVerify(token, new TextEncoder().encode(authSecret())); return NextResponse.next(); } catch { /* redirect below */ }
  }
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ message: "Sesi Anda telah berakhir. Silakan masuk kembali." }, { status: 401 });
  const login = new URL("/login", request.url); login.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(login);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
