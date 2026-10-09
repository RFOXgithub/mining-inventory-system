import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { pageParams, serialize } from "@/lib/api";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params,
    permission = kind.startsWith("purchase-")
      ? "procurement.manage"
      : "maintenance.manage",
    a = await requirePermission(permission);
  if (!a.ok)
    return NextResponse.json({ message: a.message }, { status: a.status });
  const { u, page, pageSize, skip } = pageParams(request),
    q = u.searchParams.get("q") || "",
    status = u.searchParams.get("status") || "";
  let data: any[] = [],
    total = 0,
    summary: Record<string, number> = {};
  if (kind === "purchase-requests") {
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              { requesterName: { contains: q, mode: "insensitive" as const } },
              { department: { contains: q, mode: "insensitive" as const } },
              {
                items: {
                  some: {
                    description: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    [data, total] = await Promise.all([
      db.purchaseRequest.findMany({
        where,
        include: { items: true, purchaseOrders: true },
        orderBy: { requestDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.purchaseRequest.count({ where }),
    ]);
    const all = await db.purchaseRequest.findMany({
      select: {
        status: true,
        priority: true,
        estimatedTotal: true,
        requestDate: true,
      },
    });
    summary = {
      total: all.length,
      waiting: all.filter((x) =>
        ["SUBMITTED", "WAITING_APPROVAL"].includes(x.status),
      ).length,
      approved: all.filter((x) => x.status === "APPROVED").length,
      value: all.reduce((n, x) => n + Number(x.estimatedTotal), 0),
      urgent: all.filter((x) => x.priority === "URGENT").length,
    };
  } else if (kind === "purchase-orders") {
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              {
                supplier: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    [data, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        include: { supplier: true, purchaseRequest: true, items: true },
        orderBy: { orderDate: "desc" },
        skip,
        take: pageSize,
      }),
      db.purchaseOrder.count({ where }),
    ]);
    const all = await db.purchaseOrder.findMany({ include: { items: true } }),
      now = Date.now();
    summary = {
      active: all.filter((x) => !["RECEIVED", "CANCELLED"].includes(x.status))
        .length,
      value: all.reduce((n, x) => n + Number(x.total), 0),
      waiting: all.filter((x) =>
        ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(x.status),
      ).length,
      overdue: all.filter(
        (x) =>
          x.expectedDate.getTime() < now &&
          !["RECEIVED", "CANCELLED"].includes(x.status),
      ).length,
    };
  } else if (kind === "equipment") {
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    [data, total] = await Promise.all([
      db.equipment.findMany({
        where,
        include: { maintenances: { orderBy: { updatedAt: "desc" }, take: 1 } },
        orderBy: { code: "asc" },
        skip,
        take: pageSize,
      }),
      db.equipment.count({ where }),
    ]);
    const all = await db.equipment.findMany();
    summary = {
      total: all.length,
      operational: all.filter((x) => x.status === "OPERATIONAL").length,
      maintenance: all.filter((x) =>
        ["MAINTENANCE_DUE", "UNDER_MAINTENANCE"].includes(x.status),
      ).length,
      breakdown: all.filter((x) => x.status === "BREAKDOWN").length,
    };
  } else if (kind === "maintenance") {
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              {
                equipment: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
              { technician: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    [data, total] = await Promise.all([
      db.maintenance.findMany({
        where,
        include: { equipment: true, spareParts: true, tasks: true },
        orderBy: { scheduledAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.maintenance.count({ where }),
    ]);
    const all = await db.maintenance.findMany({
        include: { spareParts: true },
      }),
      now = Date.now();
    summary = {
      scheduled: all.filter((x) => x.status === "SCHEDULED").length,
      progress: all.filter((x) => x.status === "IN_PROGRESS").length,
      overdue: all.filter(
        (x) => x.scheduledAt.getTime() < now && x.status === "SCHEDULED",
      ).length,
      breakdown: all.filter(
        (x) => x.type === "EMERGENCY" && x.status !== "COMPLETED",
      ).length,
      cost: all.reduce(
        (n, x) =>
          n +
          Number(x.laborCost) +
          Number(x.externalCost) +
          Number(x.otherCost) +
          x.spareParts.reduce(
            (m, p) => m + Number(p.quantity) * Number(p.unitCost),
            0,
          ),
        0,
      ),
    };
  } else if (kind === "spare-parts") {
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { partNumber: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    [data, total] = await Promise.all([
      db.sparePart.findMany({
        where,
        include: {
          supplier: true,
          equipment: { include: { equipment: true } },
          inventory: true,
        },
        orderBy: { code: "asc" },
        skip,
        take: pageSize,
      }),
      db.sparePart.count({ where }),
    ]);
    data = data.map((x) => ({
      ...x,
      currentStock: x.inventory.reduce(
        (n: number, t: { direction: string; quantity: unknown }) => n + (t.direction === "IN" ? 1 : -1) * Number(t.quantity),
        0,
      ),
    }));
    const all = await db.sparePart.findMany({ include: { inventory: true } }),
      balances = all.map((x) => ({
        x,
        b: x.inventory.reduce(
          (n: number, t: { direction: string; quantity: unknown }) => n + (t.direction === "IN" ? 1 : -1) * Number(t.quantity),
          0,
        ),
      }));
    summary = {
      total: all.length,
      low: balances.filter(({ x, b }) => b > 0 && b <= Number(x.minimumStock))
        .length,
      out: balances.filter(({ b }) => b <= 0).length,
      value: balances.reduce((n, { x, b }) => n + b * Number(x.unitCost), 0),
    };
  } else
    return NextResponse.json(
      { message: "Modul tidak ditemukan." },
      { status: 404 },
    );
  return NextResponse.json(
    serialize({ data, meta: { page, pageSize, total }, summary }),
  );
}
