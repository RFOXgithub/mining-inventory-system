import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_USER } from "@/lib/demo-auth";
import { effectivePermissions } from "@/features/access/service";
import { assertSameOrigin, domainResponse } from "@/lib/domain-error";

const schema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return domainResponse(error); }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Email atau kata sandi tidak valid." }, { status: 422 });
  if (process.env.NODE_ENV !== "production" && parsed.data.email.toLowerCase() === DEMO_USER.email && parsed.data.password === DEMO_USER.password) {
    const token = await createSessionToken({ userId: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, roles: [...DEMO_USER.roles], permissions: [...DEMO_USER.permissions], functions: [], plantIds: [], allPlants: false, sessionVersion: 0, demo: true });
    const response = NextResponse.json({ user: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, roles: DEMO_USER.roles }, demo: true, destination: "/users" });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
    return response;
  }
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  if (!user?.active || user.status !== "ACTIVE" || (user.lockedUntil && user.lockedUntil > new Date()) || !(await compare(parsed.data.password, user.passwordHash))) return NextResponse.json({ message: "Email atau kata sandi salah, atau akun sedang tidak aktif." }, { status: 401 });
  const roles = user.roles.map((item) => item.role.code);
  const permissions = effectivePermissions(roles, user.functions, user.actionPermissions);
  const token = await createSessionToken({ userId: user.id, email: user.email, name: user.name, roles, permissions, functions: user.functions, plantIds: [], allPlants: user.allPlants, sessionVersion: user.sessionVersion });
  const destination = permissions.includes("users.manage") ? "/users" : permissions.includes("master.material.read") ? "/materials" : permissions.includes("master.location.read") ? "/locations" : permissions.includes("inventory.read") ? "/inventory" : "/";
  const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, roles }, destination });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  await db.auditLog.create({ data: { userId: user.id, module: "AUTH", action: "LOGIN", newValue: { email: user.email }, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return response;
}
