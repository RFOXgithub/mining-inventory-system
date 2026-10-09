import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { DEVELOPMENT_AUTH_SECRET } from "@/lib/demo-auth";
import { db } from "@/lib/db";
import { AccessActor, can, requiresCompanyScope } from "@/lib/access";
import { effectivePermissions, sessionIsCurrent } from "@/features/access/service";
import { assertSameOrigin } from "@/lib/domain-error";

export const SESSION_COOKIE = "quarryflow_session";
export type Session = AccessActor & { email: string; name: string; sessionVersion: number; demo?: boolean };

function secret() {
  const configured = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("AUTH_SECRET wajib diisi dengan minimal 32 karakter pada environment production.");
  }
  const value = configured || DEVELOPMENT_AUTH_SECRET;
  return new TextEncoder().encode(value);
}

export async function createSessionToken(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret());
}

export async function readSessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secret()); return payload as unknown as Session; } catch { return null; }
}

export async function getSession() {
  const token = await readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token) return null;
  if (token.demo && process.env.NODE_ENV !== "production") return token;
  const user = await db.user.findUnique({ where: { id: token.userId }, include: { roles: { include: { role: true } }, plantScopes: { include: { plant: { select: { active: true } } } } } });
  if (!user || !sessionIsCurrent(user, token.sessionVersion)) return null;
  const roles = user.roles.map(r => r.role.code);
  return { userId: user.id, email: user.email, name: user.name, roles, functions: user.functions,
    permissions: effectivePermissions(roles, user.functions, user.actionPermissions),
    plantIds: user.plantScopes.filter(p => p.plant.active).map(p => p.plantId), allPlants: user.allPlants, sessionVersion: user.sessionVersion };
}

export async function requirePermission(permission: string, options: { plantId?: string; scoped?: boolean; request?: Request } = {}) {
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401, message: "Sesi Anda telah berakhir. Silakan masuk kembali." };
  if (!can(session, permission, options.plantId)) return { ok: false as const, status: 403, message: "Anda tidak memiliki izin untuk melakukan tindakan ini." };
  if (permission === "audit.read" && !session.roles.includes("SUPERADMIN") && !session.allPlants) return { ok: false as const, status: 403, message: "Audit legacy belum mendukung filter plant. Cakupan semua plant diperlukan." };
  if (!options.scoped && !options.plantId && requiresCompanyScope(permission) && !session.allPlants) return { ok: false as const, status: 403, message: "Modul ini belum mendukung filter plant. Akses memerlukan cakupan semua plant yang diberikan secara eksplisit." };
  if (options.request) { try { assertSameOrigin(options.request); } catch { return { ok: false as const, status: 403, message: "Asal permintaan tidak valid." }; } }
  return { ok: true as const, session };
}
