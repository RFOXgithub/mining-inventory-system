import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

const DEFAULT_PREFIXES: Record<string, string> = {
  STOCK_OPNAME: "STP", STOCK_TRANSFER: "TRF", QUOTATION: "QUO",
  SALES_ORDER: "SO", DELIVERY_ORDER: "DO", SURAT_JALAN: "SJ",
  INVOICE: "INV", PAYMENT: "PAY", PURCHASE_REQUEST: "PR",
  PURCHASE_ORDER: "PO", RECEIVING: "RCV", MAINTENANCE: "MNT",
  INVENTORY: "INVTX", CUSTOMER: "CUS", SUPPLIER: "SUP",
  EQUIPMENT: "EQP", VEHICLE: "VEH", DRIVER: "DRV", SPARE_PART: "SPR",
};

export async function nextDocumentNumber(
  db: Db,
  documentType: string,
  date = new Date(),
  prefix = DEFAULT_PREFIXES[documentType] ?? documentType,
) {
  const configured = await db.systemSetting.findUnique({ where: { key: "settings.documents" } });
  const definitions = configured?.value as Record<string, { prefix?: string }> | null;
  prefix = definitions?.[documentType]?.prefix || prefix;
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const sequence = await db.numberSequence.upsert({
    where: { documentType_period: { documentType, period } },
    create: { documentType, period, prefix: `${prefix}-${period}`, lastNumber: 1, padding: 4 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${sequence.prefix}-${String(sequence.lastNumber).padStart(sequence.padding, "0")}`;
}
