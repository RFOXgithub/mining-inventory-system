import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { trialMigration, trialSchema } from "../src/features/inventory/staging-trial";
// Read-only trial: this entrypoint cannot promote, post, or run migrations.
async function main() {
  const [manifestPath, outputDir] = process.argv.slice(2); if (!manifestPath || !outputDir || !process.env.STAGING_DATABASE_URL || !process.env.STAGING_ACTOR_ID) throw new Error("Usage: tsx scripts/quarryflow-staging-trial.ts manifest.json output-directory; STAGING_DATABASE_URL and STAGING_ACTOR_ID required.");
  if (process.env.NODE_ENV === "production" || process.env.STAGING_DATABASE_URL === process.env.DATABASE_URL) throw new Error("Trial requires a separate staging connection.");
  const manifest = trialSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8"))), files = new Map<string, Uint8Array>(), root = path.dirname(path.resolve(manifestPath));
  for (const source of manifest.sources) { const location = path.resolve(root, source.file); if (!location.startsWith(root + path.sep)) throw new Error("Source files must be inside the manifest directory."); if (existsSync(location)) files.set(source.id, readFileSync(location)); }
  const db = new PrismaClient({ datasourceUrl: process.env.STAGING_DATABASE_URL });
  try { const user = await db.user.findUniqueOrThrow({ where: { id: process.env.STAGING_ACTOR_ID }, include: { roles: { include: { role: true } }, plantScopes: true } }); if (!user.active || user.status !== "ACTIVE") throw new Error("Staging actor inactive.");
    const report = await trialMigration(db, { userId: user.id, roles: user.roles.map(r => r.role.code), functions: user.functions, permissions: user.actionPermissions, plantIds: user.plantScopes.map(p => p.plantId), allPlants: user.allPlants }, manifest, files);
    const dir = path.resolve(outputDir); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${report.batchId}.trial.json`), JSON.stringify(report, null, 2), { mode: 0o600 }); console.info(JSON.stringify({ batchId: report.batchId, reconciledCount: report.reconciledCount, exceptions: report.exceptions.length, readyForReview: report.readyForReview, promotionAuthorized: false })); if (report.exceptions.length) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database redacted]") : "Trial failed"); process.exitCode = 1; });
