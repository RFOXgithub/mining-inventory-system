import { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_USER } from "@/lib/demo-auth";

type Db = Prisma.TransactionClient | PrismaClient;
type AuditInput = {
  userId?: string | null; module: string; action: string; recordId?: string;
  previousValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue;
  request?: Request;
};

export async function writeAudit(db: Db, input: AuditInput) {
  const forwarded = input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return db.auditLog.create({ data: {
    userId: input.userId === DEMO_USER.id && process.env.NODE_ENV !== "production" ? null : input.userId,
    module: input.module, action: input.action, recordId: input.recordId,
    previousValue: input.previousValue, newValue: input.newValue,
    ipAddress: forwarded ?? input.request?.headers.get("x-real-ip") ?? undefined,
    userAgent: input.request?.headers.get("user-agent") ?? undefined,
  } });
}
