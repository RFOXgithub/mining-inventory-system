import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { allowedActions } from "../src/lib/access";
import { assignmentSchema } from "../src/features/access/schema";
import { writeAudit } from "../src/lib/audit";

// Provision new development accounts; never reset existing users or migrate a database.
async function main() {
  const url = process.env.QUARRYFLOW_ACCESS_DATABASE_URL;
  if (!url || process.env.QUARRYFLOW_ACCESS_ENVIRONMENT !== "development" || process.env.NODE_ENV === "production") {
    throw new Error("Set QUARRYFLOW_ACCESS_DATABASE_URL and QUARRYFLOW_ACCESS_ENVIRONMENT=development for a confirmed development database.");
  }
  const profiles = [
    { name: "Development administrator", email: "admin.dev@quarryflow.local", role: "SUPERADMIN", functions: [] },
    { name: "Development PC / Finance", email: "operator.dev@quarryflow.local", role: "ADMIN", functions: ["PC", "FINANCE"] },
    { name: "Development PC / Finance verifier", email: "verifier.dev@quarryflow.local", role: "ADMIN", functions: ["PC", "FINANCE"] },
    { name: "Development Manager", email: "manager.dev@quarryflow.local", role: "MANAGER", functions: [] },
    { name: "Development HSE", email: "hse.dev@quarryflow.local", role: "HSE", functions: [] },
    { name: "Development HSE verifier", email: "hse.verifier.dev@quarryflow.local", role: "HSE", functions: [] },
    { name: "Development Director", email: "director.dev@quarryflow.local", role: "DIREKTUR", functions: [] },
  ].map(profile => ({ ...profile, assignment: assignmentSchema.parse({ role: profile.role, functions: profile.functions, permissions: [...new Set(allowedActions(profile.role, profile.functions))], allPlants: true, plantIds: [] }) }));
  const prepared = await Promise.all(profiles.map(async profile => {
    const password = `QF!${randomBytes(18).toString("base64url")}`;
    return { ...profile, password, passwordHash: await hash(password, 12) };
  }));
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const credentials = await db.$transaction(async tx => {
      const roles = await tx.role.findMany({ where: { code: { in: profiles.map(p => p.role) } }, select: { id: true, code: true } });
      if (new Set(roles.map(r => r.code)).size !== 5) throw new Error("Apply the approved foundation migration to development first. This script does not run migrations.");
      const existing = await tx.user.count({ where: { email: { in: profiles.map(p => p.email) } } });
      if (existing) throw new Error("Development accounts already exist; manage their access/passwords through Users. No existing account was changed.");
      const created = [];
      let administratorId = "";
      for (const profile of prepared) {
        const role = roles.find(r => r.code === profile.role)!;
        const user = await tx.user.create({ data: {
          name: profile.name, email: profile.email, passwordHash: profile.passwordHash,
          active: true, status: "ACTIVE", allPlants: true,
          functions: profile.assignment.functions, actionPermissions: profile.assignment.permissions,
          roles: { create: { roleId: role.id } },
        }, select: { id: true, email: true } });
        if (profile.role === "SUPERADMIN") administratorId = user.id;
        await writeAudit(tx, { userId: administratorId, module: "USERS", action: "DEV_ACCOUNT_CREATE", recordId: user.id,
          newValue: { email: user.email, assignment: profile.assignment, environment: "development" } });
        created.push({ email: user.email, password: profile.password, role: profile.role, functions: profile.functions, allPlants: true });
      }
      return created;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });
    // Credentials are returned once to the operator, never saved in source or audit.
    console.info(JSON.stringify({ environment: "development", credentials }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  const code = (error as { code?: string }).code;
  if (code) console.error(`Account provisioning failed (${code}); check the development connection and applied migrations.`);
  else console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database redacted]") : "Account provisioning failed.");
  process.exitCode = 1;
});
