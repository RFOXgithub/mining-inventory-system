import { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { allowedActions, can, AccessActor } from "@/lib/access";
import { DomainError } from "@/lib/domain-error";
import { writeAudit } from "@/lib/audit";
import { assignmentSchema, userCreateSchema, userUpdateSchema } from "./schema";

export function assertUserManager(actor: AccessActor) {
  if (!can(actor, "users.manage")) throw new DomainError(403, "Anda tidak memiliki izin mengelola user.");
}

export function sessionIsCurrent(user: { active: boolean; status: string; lockedUntil: Date | null; sessionVersion: number }, version: number | undefined) {
  return user.active && user.status === "ACTIVE" && (!user.lockedUntil || user.lockedUntil <= new Date()) && version === user.sessionVersion;
}

async function assignmentData(tx: Prisma.TransactionClient, assignment: z.infer<typeof assignmentSchema>) {
  const role = await tx.role.findUnique({ where: { code: assignment.role } });
  if (!role) throw new DomainError(422, "Role final belum tersedia. Terapkan migration fondasi.");
  const count = await tx.plant.count({ where: { id: { in: assignment.plantIds }, active: true } });
  if (count !== assignment.plantIds.length) throw new DomainError(422, "Plant assignment tidak ditemukan atau nonaktif.");
  return { ...assignment, role };
}

export async function createUser(client: PrismaClient, actor: AccessActor, raw: unknown, request?: Request) {
  assertUserManager(actor);
  const input = userCreateSchema.parse(raw);
  const passwordHash = await hash(input.password, 12);
  return client.$transaction(async tx => {
    const assignment = await assignmentData(tx, input.assignment);
    const row = await tx.user.create({ data: {
      name: input.name, email: input.email, passwordHash,
      functions: assignment.functions, actionPermissions: assignment.permissions, allPlants: assignment.allPlants,
      roles: { create: { roleId: assignment.role.id } }, plantScopes: { create: assignment.plantIds.map(plantId => ({ plantId })) },
    }, select: { id: true, name: true, email: true } });
    await writeAudit(tx, { userId: actor.userId, module: "USERS", action: "CREATE", recordId: row.id, newValue: { name: row.name, email: row.email, assignment: input.assignment }, request });
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function updateUser(client: PrismaClient, actor: AccessActor, id: string, raw: unknown, request?: Request) {
  assertUserManager(actor);
  const input = userUpdateSchema.parse(raw);
  const passwordHash = input.newPassword ? await hash(input.newPassword, 12) : undefined;
  return client.$transaction(async tx => {
    const old = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } }, plantScopes: true } });
    if (!old) throw new DomainError(404, "User tidak ditemukan.");
    if (old.sessionVersion !== input.sessionVersion) throw new DomainError(409, "Akses user telah berubah. Muat ulang.");
    const assignment = await assignmentData(tx, input.assignment);
    const retainsAdmin = assignment.role.code === "SUPERADMIN" && assignment.permissions.includes("users.manage") && input.status === "ACTIVE";
    if (id === actor.userId && !retainsAdmin) throw new DomainError(409, "Anda tidak dapat mencabut akses pengelolaan akun sendiri.");
    if (old.roles.some(r => r.role.code === "SUPERADMIN") && old.actionPermissions.includes("users.manage") && old.active && !retainsAdmin) {
      const others = await tx.user.count({ where: { id: { not: id }, active: true, status: "ACTIVE", actionPermissions: { has: "users.manage" }, roles: { some: { role: { code: "SUPERADMIN" } } } } });
      if (!others) throw new DomainError(409, "Pertahankan setidaknya satu SUPERADMIN aktif dengan izin user.");
    }
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userPlantScope.deleteMany({ where: { userId: id } });
    const updated = await tx.user.updateMany({ where: { id, sessionVersion: input.sessionVersion }, data: {
      name: input.name, status: input.status, active: input.status === "ACTIVE", lockedUntil: null,
      functions: assignment.functions, actionPermissions: assignment.permissions, allPlants: assignment.allPlants,
      passwordHash, sessionVersion: { increment: 1 },
    } });
    if (!updated.count) throw new DomainError(409, "Akses user telah berubah. Muat ulang.");
    await tx.userRole.create({ data: { userId: id, roleId: assignment.role.id } });
    await tx.userPlantScope.createMany({ data: assignment.plantIds.map(plantId => ({ userId: id, plantId })) });
    await writeAudit(tx, { userId: actor.userId, module: "USERS", action: passwordHash ? "RESET_PASSWORD_ACCESS" : "UPDATE_ACCESS", recordId: id,
      previousValue: { name: old.name, status: old.status, roles: old.roles.map(r => r.role.code), functions: old.functions, permissions: old.actionPermissions, allPlants: old.allPlants, plantIds: old.plantScopes.map(p => p.plantId) },
      newValue: { name: input.name, status: input.status, assignment: input.assignment, sessionVersion: old.sessionVersion + 1 }, request });
    return { id, sessionVersion: old.sessionVersion + 1 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export function effectivePermissions(roles: string[], functions: string[], grants: string[]) {
  return grants.filter(p => roles.some(role => allowedActions(role, functions).includes(p)));
}
