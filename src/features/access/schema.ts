import { z } from "zod";
import { allowedActions, FINAL_ROLES } from "@/lib/access";

export const assignmentSchema = z.object({
  role: z.enum(FINAL_ROLES),
  functions: z.array(z.enum(["PC", "FINANCE"])).max(2).default([]),
  permissions: z.array(z.string()).max(200),
  plantIds: z.array(z.string().uuid()).max(100).default([]),
  allPlants: z.boolean().default(false),
}).strict().superRefine((data, ctx) => {
  if (data.role !== "ADMIN" && data.functions.length) ctx.addIssue({ code: "custom", path: ["functions"], message: "Fungsi PC/Finance hanya untuk role ADMIN." });
  if (data.role === "ADMIN" && !data.functions.length) ctx.addIssue({ code: "custom", path: ["functions"], message: "Pilih fungsi ADMIN." });
  const allowed = allowedActions(data.role, data.functions);
  if (data.permissions.some(p => !allowed.includes(p))) ctx.addIssue({ code: "custom", path: ["permissions"], message: "Action tidak sesuai role/fungsi." });
  if (data.allPlants && data.plantIds.length) ctx.addIssue({ code: "custom", path: ["plantIds"], message: "Pilih semua plant atau plant tertentu, bukan keduanya." });
  if (new Set(data.plantIds).size !== data.plantIds.length || new Set(data.permissions).size !== data.permissions.length || new Set(data.functions).size !== data.functions.length) ctx.addIssue({ code: "custom", message: "Assignment tidak boleh duplikat." });
  if (data.role !== "SUPERADMIN" && !data.allPlants && !data.plantIds.length) ctx.addIssue({ code: "custom", path: ["plantIds"], message: "Pilih cakupan plant." });
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(3).max(100), email: z.string().trim().email().transform(v => v.toLowerCase()),
  password: z.string().min(10).max(128), assignment: assignmentSchema,
}).strict();

export const userUpdateSchema = z.object({
  name: z.string().trim().min(3).max(100), status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]),
  sessionVersion: z.number().int().nonnegative(), assignment: assignmentSchema,
  newPassword: z.string().min(10).max(128).optional(),
}).strict();
