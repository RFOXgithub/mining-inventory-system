import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Forbidden } from "@/components/page-access";
const money = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  num = (n: number) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n),
  date = (d: Date) => d.toLocaleString("id-ID");
type Kind =
  | "purchase-requests"
  | "purchase-orders"
  | "equipment"
  | "maintenance"
  | "spare-parts";
export async function OperationsDetail({
  kind,
  id,
}: {
  kind: Kind;
  id: string;
}) {
  const auth = await requirePermission(kind.startsWith("purchase-") ? "procurement.manage" : "maintenance.manage");
  if (!auth.ok) return <Forbidden message={auth.message} />;
  let r: any;
  if (kind === "purchase-requests")
    r = await db.purchaseRequest.findUnique({
      where: { id },
      include: {
        items: { include: { sparePart: true } },
        purchaseOrders: true,
      },
    });
  else if (kind === "purchase-orders")
    r = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseRequest: true,
        items: true,
        receivings: { include: { items: true } },
      },
    });
  else if (kind === "equipment")
    r = await db.equipment.findUnique({
      where: { id },
      include: {
        maintenances: true,
        compatibleParts: { include: { sparePart: true } },
      },
    });
  else if (kind === "maintenance")
    r = await db.maintenance.findUnique({
      where: { id },
      include: {
        equipment: true,
        tasks: true,
        spareParts: { include: { sparePart: true } },
      },
    });
  else
    r = await db.sparePart.findUnique({
      where: { id },
      include: {
        supplier: true,
        equipment: { include: { equipment: true } },
        inventory: {
          include: { stockpile: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  if (!r) notFound();
  const title = r.number || r.name,
    active =
      kind === "purchase-requests"
        ? "Purchase Requests"
        : kind === "purchase-orders"
          ? "Purchase Orders"
          : kind === "equipment"
            ? "Equipment"
            : kind === "maintenance"
              ? "Maintenance"
              : "Spare Parts",
    audits = await db.auditLog.findMany({
      where: { recordId: id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  return (
    <AppShell active={active}>
      <div className="content enterprise-page">
        <Link className="back-link" href={`/${kind}`}>
          <ArrowLeft size={14} />
          Kembali
        </Link>
        <div className="detail-hero">
          <div>
            <span className="eyebrow">{active.toUpperCase()} / DETAIL</span>
            <h1>{title}</h1>
            <p>
              {r.department ||
                r.supplier?.name ||
                r.equipment?.name ||
                r.location ||
                r.code}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>
        {kind === "purchase-requests" && <PR r={r} />}{" "}
        {kind === "purchase-orders" && <PO r={r} />}{" "}
        {kind === "equipment" && <Equipment r={r} />}{" "}
        {kind === "maintenance" && <Maintenance r={r} />}{" "}
        {kind === "spare-parts" && <Part r={r} />}
        <section className="detail-section">
          <h2>Activity</h2>
          <div className="timeline">
            {audits.length ? (
              audits.map((a) => (
                <div key={a.id}>
                  <i />
                  <time>{date(a.createdAt)}</time>
                  <strong>{a.action}</strong>
                  <span>{a.user?.name || "System"}</span>
                </div>
              ))
            ) : (
              <p className="muted">Belum ada aktivitas audit.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
function PR({ r }: { r: any }) {
  return (
    <>
      <Facts
        xs={[
          ["REQUESTER", r.requesterName],
          ["ITEMS", String(r.items.length)],
          ["ESTIMATED", money(Number(r.estimatedTotal))],
          ["PRIORITY", r.priority],
        ]}
      />
      <Section
        title="Items"
        heads={[
          "Item",
          "Category",
          "Qty",
          "Unit",
          "Estimated Price",
          "Subtotal",
          "Reason",
        ]}
        rows={r.items.map((x: any) => [
          x.description,
          x.category,
          num(Number(x.quantity)),
          x.unit,
          money(Number(x.estimatedPrice)),
          money(Number(x.quantity) * Number(x.estimatedPrice)),
          x.reason,
        ])}
      />
    </>
  );
}
function PO({ r }: { r: any }) {
  return (
    <>
      <Facts
        xs={[
          ["SUPPLIER", r.supplier.name],
          ["PR REFERENCE", r.purchaseRequest?.number || "—"],
          ["TOTAL", money(Number(r.total))],
          ["EXPECTED", date(r.expectedDate)],
        ]}
      />
      <Section
        title="Items & Receiving"
        heads={["Item", "Ordered", "Received", "Remaining", "Progress"]}
        rows={r.items.map((x: any) => {
          const q = Number(x.quantity),
            got = Number(x.receivedQuantity);
          return [
            x.description,
            num(q),
            num(got),
            num(q - got),
            `${Math.round((got / Math.max(q, 1)) * 100)}%`,
          ];
        })}
      />
    </>
  );
}
function Equipment({ r }: { r: any }) {
  const next =
    Number(r.lastMaintenanceHour) +
    Number(r.maintenanceInterval) -
    Number(r.hourMeter);
  return (
    <>
      <Facts
        xs={[
          ["HOUR METER", `${num(Number(r.hourMeter))} h`],
          [
            "NEXT MAINTENANCE",
            next < 0 ? `Overdue ${num(-next)} h` : `${num(next)} h`,
          ],
          ["LOCATION", r.location],
          ["CATEGORY", r.category],
        ]}
      />
      <Facts
        xs={[
          ["BRAND", r.brand || "—"],
          ["MODEL", r.model || "—"],
          ["SERIAL NUMBER", r.serialNumber || "—"],
          ["INTERVAL", `${num(Number(r.maintenanceInterval))} h`],
        ]}
      />
    </>
  );
}
function Maintenance({ r }: { r: any }) {
  const parts = r.spareParts.reduce(
      (n: number, x: any) => n + Number(x.quantity) * Number(x.unitCost),
      0,
    ),
    total =
      parts +
      Number(r.laborCost) +
      Number(r.externalCost) +
      Number(r.otherCost);
  return (
    <>
      <Facts
        xs={[
          ["EQUIPMENT", r.equipment.name],
          ["TYPE", r.type],
          ["TECHNICIAN", r.technician || "—"],
          ["TOTAL COST", money(total)],
        ]}
      />
      <section className="detail-section">
        <h2>Tasks</h2>
        {r.tasks.map((x: any) => (
          <div className="detail-line" key={x.id}>
            <strong>
              {x.completedAt ? "☑" : "□"} {x.description}
            </strong>
            <span>{x.required ? "Required" : "Optional"}</span>
          </div>
        ))}
      </section>
      <Section
        title="Spare Parts Used"
        heads={["Part", "Qty", "Unit Cost", "Total"]}
        rows={r.spareParts.map((x: any) => [
          x.sparePart.name,
          num(Number(x.quantity)),
          money(Number(x.unitCost)),
          money(Number(x.quantity) * Number(x.unitCost)),
        ])}
      />
    </>
  );
}
function Part({ r }: { r: any }) {
  const stock = r.inventory.reduce(
    (n: number, x: any) =>
      n + (x.direction === "IN" ? 1 : -1) * Number(x.quantity),
    0,
  );
  return (
    <>
      <Facts
        xs={[
          ["CURRENT STOCK", `${num(stock)} ${r.unit}`],
          ["MINIMUM", `${num(Number(r.minimumStock))} ${r.unit}`],
          ["VALUE", money(stock * Number(r.unitCost))],
          ["LOCATION", r.storageLocation],
        ]}
      />
      <Section
        title="Stock Movement"
        heads={["Date", "Reference", "Transaction", "In", "Out", "Balance"]}
        rows={r.inventory.map((x: any) => [
          date(x.createdAt),
          x.referenceType,
          x.type,
          x.direction === "IN" ? num(Number(x.quantity)) : "—",
          x.direction === "OUT" ? num(Number(x.quantity)) : "—",
          num(Number(x.balanceAfter)),
        ])}
      />
    </>
  );
}
function Facts({ xs }: { xs: string[][] }) {
  return (
    <div className="detail-facts">
      {xs.map((x) => (
        <div className="detail-fact" key={x[0]}>
          <div>
            <small>{x[0]}</small>
            <strong>{x[1]}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
function Section({
  title,
  heads,
  rows,
}: {
  title: string;
  heads: string[];
  rows: string[][];
}) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      <div className="data-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {heads.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((x, j) => (
                  <td key={j}>{x}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">Belum ada data.</p>}
    </section>
  );
}
