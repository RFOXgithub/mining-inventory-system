import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL wajib dikonfigurasi. Gunakan URL PostgreSQL production pada Vercel.");
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

// Route modules are evaluated while Next.js collects build metadata on Vercel.
// Delay both environment validation and Prisma initialization until a handler
// actually performs a database operation at request time.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
