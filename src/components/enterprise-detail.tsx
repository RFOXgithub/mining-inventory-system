import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Forbidden } from "@/components/page-access";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  Truck,
  UserRound,
} from "lucide-react";
type Kind =
  | "sales-orders"
  | "quotations"
  | "deliveries"
  | "invoices"
  | "suppliers";
const money = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  date = (v: Date) =>
    v.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
  qty = (n: number) =>
    `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)} ton`;
export async function EnterpriseDetail({
  kind,
  id,
}: {
  kind: Kind;
  id: string;
}) {
  const auth = await requirePermission(kind === "invoices" ? "finance.read" : kind === "suppliers" ? "procurement.manage" : "sales.read");
  if (!auth.ok) return <Forbidden message={auth.message} />;
  let record: any;
  if (kind === "sales-orders")
    record = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
        deliveries: { include: { vehicle: true, driver: true } },
        invoices: { include: { payments: true } },
      },
    });
  else if (kind === "quotations")
    record = await db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        salesOrder: true,
      },
    });
  else if (kind === "deliveries")
    record = await db.deliveryOrder.findUnique({
      where: { id },
      include: {
        salesOrder: { include: { customer: true, items: true } },
        vehicle: true,
        driver: true,
      },
    });
  else if (kind === "invoices")
    record = await db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: true,
        items: true,
        payments: { orderBy: { paymentDate: "desc" } },
      },
    });
  else record = await db.supplier.findUnique({ where: { id } });
  if (!record) notFound();
  const audits = await db.auditLog.findMany({
    where: { recordId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const active =
      kind === "sales-orders"
        ? "Sales Orders"
        : kind === "quotations"
          ? "Quotations"
          : kind === "deliveries"
            ? "Deliveries"
            : kind === "invoices"
              ? "Invoices"
              : "Suppliers",
    label = record.number || record.name;
  return (
    <AppShell active={active}>
      <div className="content enterprise-page">
        <Link href={`/${kind}`} className="back-link">
          <ArrowLeft size={14} />
          Kembali ke {active}
        </Link>
        <div className="detail-hero">
          <div>
            <span className="eyebrow">
              {kind.replaceAll("-", " ").toUpperCase()} / DETAIL
            </span>
            <h1>{label}</h1>
            <p>
              {record.customer?.companyName ||
                record.code ||
                record.destinationSnapshot}
            </p>
          </div>
          <StatusBadge status={record.status} />
        </div>
        {kind === "sales-orders" && <SalesOrder r={record} />}{" "}
        {kind === "quotations" && <Quotation r={record} />}{" "}
        {kind === "deliveries" && <Delivery r={record} />}{" "}
        {kind === "invoices" && <Invoice r={record} />}{" "}
        {kind === "suppliers" && <Supplier r={record} />}
        <section className="detail-section">
          <div className="card-head">
            <div>
              <h2>Activity</h2>
              <small>Riwayat dari audit trail</small>
            </div>
          </div>
          <div className="timeline">
            {audits.length ? (
              audits.map((a) => (
                <div key={a.id}>
                  <i />
                  <time>{a.createdAt.toLocaleString("id-ID")}</time>
                  <strong>{a.action.replaceAll("_", " ")}</strong>
                  <span>{a.user?.name || "System"}</span>
                </div>
              ))
            ) : (
              <p className="muted">
                Belum ada aktivitas audit untuk record ini.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
function SalesOrder({ r }: { r: any }) {
  const ordered = r.items.reduce(
      (n: number, x: any) => n + Number(x.quantity),
      0,
    ),
    delivered = r.items.reduce(
      (n: number, x: any) => n + Number(x.deliveredQuantity),
      0,
    );
  return (
    <>
      <div className="detail-facts">
        <Fact icon={<Building2 />} l="Customer" v={r.customer.companyName} />
        <Fact icon={<CalendarDays />} l="Order Date" v={date(r.orderDate)} />
        <Fact icon={<FileText />} l="Total" v={money(Number(r.total))} />
        <Fact
          icon={<Truck />}
          l="Delivery Progress"
          v={`${Math.round((delivered / Math.max(ordered, 1)) * 100)}%`}
        />
      </div>
      <section className="detail-section">
        <h2>Items</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Ordered</th>
              <th>Delivered</th>
              <th>Remaining</th>
              <th>Unit Price</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((x: any) => (
              <tr key={x.id}>
                <td>{x.descriptionSnapshot}</td>
                <td>{qty(Number(x.quantity))}</td>
                <td>{qty(Number(x.deliveredQuantity))}</td>
                <td>{qty(Number(x.quantity) - Number(x.deliveredQuantity))}</td>
                <td>{money(Number(x.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function Quotation({ r }: { r: any }) {
  return (
    <>
      <div className="detail-facts">
        <Fact icon={<Building2 />} l="Customer" v={r.customer.companyName} />
        <Fact icon={<CalendarDays />} l="Created" v={date(r.quotationDate)} />
        <Fact icon={<CalendarDays />} l="Valid Until" v={date(r.validUntil)} />
        <Fact icon={<FileText />} l="Total" v={money(Number(r.total))} />
      </div>
      <section className="detail-section">
        <h2>Products</h2>
        {r.items.map((x: any) => (
          <div className="detail-line" key={x.id}>
            <strong>{x.product.name}</strong>
            <span>
              {qty(Number(x.quantity))} × {money(Number(x.unitPrice))}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
function Delivery({ r }: { r: any }) {
  const steps = ["SCHEDULED", "LOADING", "READY", "IN_TRANSIT", "DELIVERED"],
    at = Math.max(0, steps.indexOf(r.status));
  return (
    <>
      <div className="detail-facts">
        <Fact
          icon={<Building2 />}
          l="Customer"
          v={r.salesOrder.customer.companyName}
        />
        <Fact icon={<FileText />} l="Sales Order" v={r.salesOrder.number} />
        <Fact
          icon={<Truck />}
          l="Vehicle"
          v={r.vehicle?.plateNumber || "Belum ditetapkan"}
        />
        <Fact
          icon={<UserRound />}
          l="Driver"
          v={r.driver?.name || "Belum ditetapkan"}
        />
      </div>
      <section className="detail-section">
        <h2>Delivery Progress</h2>
        <div className="stepper">
          {steps.map((s, i) => (
            <div
              className={i < at ? "done" : i === at ? "current" : ""}
              key={s}
            >
              <i>{i < at ? "✓" : i + 1}</i>
              <span>{s.replaceAll("_", " ")}</span>
            </div>
          ))}
        </div>
        <div className="detail-line">
          <strong>Planned Quantity</strong>
          <span>{qty(Number(r.plannedQuantity))}</span>
        </div>
        <div className="detail-line">
          <strong>Net Weight</strong>
          <span>
            {r.netWeight ? qty(Number(r.netWeight)) : "Belum ditimbang"}
          </span>
        </div>
      </section>
    </>
  );
}
function Invoice({ r }: { r: any }) {
  const paid = r.payments.reduce(
      (n: number, x: any) => n + Number(x.amount),
      0,
    ),
    out = Number(r.total) - paid;
  return (
    <>
      <div className="finance-strip">
        <div>
          <small>TOTAL</small>
          <strong>{money(Number(r.total))}</strong>
        </div>
        <div>
          <small>PAID</small>
          <strong>{money(paid)}</strong>
        </div>
        <div className="outstanding">
          <small>OUTSTANDING</small>
          <strong>{money(out)}</strong>
        </div>
      </div>
      <div className="detail-facts">
        <Fact icon={<Building2 />} l="Customer" v={r.customer.companyName} />
        <Fact
          icon={<FileText />}
          l="Sales Order"
          v={r.salesOrder?.number || "—"}
        />
        <Fact icon={<CalendarDays />} l="Issue Date" v={date(r.issueDate)} />
        <Fact icon={<CalendarDays />} l="Due Date" v={date(r.dueDate)} />
      </div>
      <section className="detail-section">
        <h2>Payment History</h2>
        {r.payments.length ? (
          r.payments.map((x: any) => (
            <div className="detail-line" key={x.id}>
              <span>
                <strong>{x.number}</strong>
                <small>
                  {date(x.paymentDate)} · {x.method}
                </small>
              </span>
              <strong>{money(Number(x.amount))}</strong>
            </div>
          ))
        ) : (
          <p className="muted">Belum ada pembayaran tercatat.</p>
        )}
      </section>
    </>
  );
}
function Supplier({ r }: { r: any }) {
  return (
    <>
      <div className="detail-facts">
        <Fact
          icon={<FileText />}
          l="Purchase MTD"
          v={money(Number(r.purchaseMonthToDate))}
        />
        <Fact
          icon={<Building2 />}
          l="Category"
          v={r.category.replaceAll("_", " ")}
        />
        <Fact icon={<UserRound />} l="PIC" v={r.pic} />
        <Fact
          icon={<CalendarDays />}
          l="Payment Terms"
          v={`NET ${r.paymentTerms}`}
        />
      </div>
      <section className="detail-section">
        <h2>Company Information</h2>
        <div className="overview-grid">
          <Fact l="Contact" v={`${r.phone}${r.email ? ` · ${r.email}` : ""}`} />
          <Fact l="Address" v={r.address} />
          <Fact l="Materials" v={r.materials.join(", ") || "—"} />
          <Fact l="Tax Information" v={r.taxInformation || "—"} />
        </div>
      </section>
    </>
  );
}
function Fact({
  icon,
  l,
  v,
}: {
  icon?: React.ReactNode;
  l: string;
  v: string;
}) {
  return (
    <div className="detail-fact">
      {icon && <span>{icon}</span>}
      <div>
        <small>{l}</small>
        <strong>{v}</strong>
      </div>
    </div>
  );
}
