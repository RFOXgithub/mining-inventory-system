"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
type Kind =
  | "sales-orders"
  | "quotations"
  | "deliveries"
  | "invoices"
  | "suppliers";
type Payload = {
  data: any[];
  meta: { page: number; pageSize: number; total: number };
  summary: Record<string, number>;
  filters?: { customers?: Array<{ id: string; companyName: string }> };
};
const config = {
  "sales-orders": {
    active: "Sales Orders",
    crumb: "COMMERCIAL / SALES ORDERS",
    title: "Sales Orders",
    sub: "Pantau pesanan pelanggan dari konfirmasi hingga pengiriman selesai.",
    search: "Cari SO / Customer / Product...",
    empty:
      "Belum ada Sales Order. Buat pesanan pertama untuk mulai mengelola penjualan dan pengiriman.",
    newLabel: "Sales Order",
    statuses: [
      "DRAFT",
      "CONFIRMED",
      "PARTIALLY_DELIVERED",
      "DELIVERED",
      "CANCELLED",
    ],
  },
  quotations: {
    active: "Quotations",
    crumb: "COMMERCIAL / QUOTATIONS",
    title: "Quotations",
    sub: "Kelola penawaran harga sebelum dikonversi menjadi Sales Order.",
    search: "Cari quotation / customer / product...",
    empty: "Belum ada quotation aktif.",
    newLabel: "Quotation",
    statuses: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"],
  },
  deliveries: {
    active: "Deliveries",
    crumb: "OPERATIONS / DELIVERIES",
    title: "Deliveries",
    sub: "Pantau loading, armada, perjalanan, dan penyelesaian pengiriman.",
    search: "Cari DO / SO / customer / kendaraan...",
    empty: "Tidak ada pengiriman yang dijadwalkan.",
    newLabel: "Delivery Order",
    statuses: [
      "SCHEDULED",
      "LOADING",
      "READY",
      "IN_TRANSIT",
      "DELIVERED",
      "FAILED",
      "CANCELLED",
    ],
  },
  invoices: {
    active: "Invoices",
    crumb: "COMMERCIAL / INVOICES",
    title: "Invoices",
    sub: "Pantau tagihan pelanggan, pembayaran, dan piutang jatuh tempo.",
    search: "Cari invoice / customer / SO...",
    empty: "Tidak ada invoice pada periode ini.",
    newLabel: "Invoice",
    statuses: [
      "DRAFT",
      "UNPAID",
      "PARTIALLY_PAID",
      "PAID",
      "OVERDUE",
      "CANCELLED",
    ],
  },
  suppliers: {
    active: "Suppliers",
    crumb: "PROCUREMENT / SUPPLIERS",
    title: "Suppliers",
    sub: "Kelola pemasok material, spare part, dan kebutuhan operasional quarry.",
    search: "Supplier name / code / PIC...",
    empty: "Belum ada supplier yang terdaftar.",
    newLabel: "Supplier",
    statuses: ["ACTIVE", "INACTIVE"],
  },
} as const;
const money = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  qty = (n: number) =>
    `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)} T`,
  date = (v: string) =>
    new Date(v).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
export function EnterpriseList({ kind }: { kind: Kind }) {
  const c = config[kind],
    [payload, setPayload] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [customer, setCustomer] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [view, setView] = useState<"list" | "board">("list");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const p = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (customer) p.set("customer", customer);
    if (category) p.set("category", category);
    try {
      const r = await fetch(`/api/${kind}?${p}`, { cache: "no-store" }),
        j = await r.json();
      if (!r.ok) throw new Error(j.message || "Data tidak dapat dimuat.");
      setPayload(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [kind, page, q, status, customer, category]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const pages = Math.max(1, Math.ceil((payload?.meta.total || 0) / 10)),
    rows = payload?.data || [],
    kpis = useMemo(
      () => getKpis(kind, payload?.summary || {}),
      [kind, payload],
    );
  function exportCsv() {
    if (!rows.length) return;
    const lines = [
        Object.keys(rows[0])
          .filter((k) => typeof rows[0][k] !== "object")
          .join(","),
        ...rows.map((r) =>
          Object.values(r)
            .filter((v) => typeof v !== "object")
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      ],
      blob = new Blob([lines.join("\n")], { type: "text/csv" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <AppShell active={c.active}>
      <div className="content enterprise-page">
        <div className="enterprise-head">
          <div>
            <span className="eyebrow">{c.crumb}</span>
            <h1>{c.title}</h1>
            <p>{c.sub}</p>
          </div>
          <div className="page-actions">
            <button className="btn" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} />
              Export
            </button>
            {kind === "deliveries" && (
              <button
                className="btn"
                onClick={() => setView(view === "list" ? "board" : "list")}
              >
                {view === "list" ? "Dispatch Board" : "List View"}
              </button>
            )}
          </div>
        </div>
        <div className="erp-kpis">
          {loading && !payload
            ? Array.from({ length: 4 }, (_, i) => (
                <div className="erp-kpi skeleton" key={i} />
              ))
            : kpis.map((x) => (
                <div className={`erp-kpi ${x.tone || ""}`} key={x.label}>
                  <small>{x.label}</small>
                  <strong>{x.value}</strong>
                  <span>{x.note}</span>
                </div>
              ))}
        </div>
        <div className="filter-bar">
          <label className="erp-search">
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={c.search}
            />
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {c.statuses.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {kind === "sales-orders" && (
            <select
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua customer</option>
              {payload?.filters?.customers?.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.companyName}
                </option>
              ))}
            </select>
          )}
          {kind === "suppliers" && (
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua kategori</option>
              {[
                "RAW_MATERIAL",
                "SPARE_PART",
                "FUEL",
                "EQUIPMENT",
                "SERVICE",
                "OTHER",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          )}
        </div>
        {error ? (
          <div className="erp-error">
            <strong>Data tidak dapat dimuat</strong>
            <span>{error}</span>
            <button className="btn" onClick={load}>
              Coba lagi
            </button>
          </div>
        ) : kind === "deliveries" && view === "board" ? (
          <DispatchBoard rows={rows} loading={loading} />
        ) : (
          <ListTable
            kind={kind}
            rows={rows}
            loading={loading}
            empty={c.empty}
          />
        )}
        <div className="pagination">
          <span>
            Menampilkan {rows.length} dari {payload?.meta.total || 0} data
          </span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span>
              Halaman {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
function ListTable({
  kind,
  rows,
  loading,
  empty,
}: {
  kind: Kind;
  rows: any[];
  loading: boolean;
  empty: string;
}) {
  const heads: { [K in Kind]: string[] } = {
    "sales-orders": [
      "SO Number",
      "Customer",
      "Order Date",
      "Product",
      "Ordered",
      "Delivered",
      "Remaining",
      "Total",
      "Delivery Progress",
      "Status",
      "",
    ],
    quotations: [
      "Quotation",
      "Customer",
      "Created",
      "Valid Until",
      "Products",
      "Total",
      "Validity",
      "Status",
      "",
    ],
    deliveries: [
      "DO Number",
      "SO",
      "Customer",
      "Product",
      "Quantity",
      "Vehicle",
      "Driver",
      "Schedule",
      "Status",
      "",
    ],
    invoices: [
      "Invoice",
      "Customer",
      "SO",
      "Issue Date",
      "Due Date",
      "Total",
      "Paid",
      "Outstanding",
      "Status",
      "",
    ],
    suppliers: [
      "Supplier",
      "Category",
      "Materials",
      "PIC",
      "Contact",
      "Payment Terms",
      "Purchase MTD",
      "Status",
      "",
    ],
  };
  return (
    <section className="erp-table-wrap">
      <div className="data-scroll">
        <table className="data-table erp-table">
          <thead>
            <tr>
              {heads[kind].map((h, i) => (
                <th key={`${h}-${i}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {heads[kind].map((_, j) => (
                      <td key={j}>
                        <i />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => <Row kind={kind} row={r} key={r.id} />)}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && (
        <div className="erp-empty">
          <div>
            <Search />
          </div>
          <strong>{empty}</strong>
          <span>Ubah filter atau buat data baru untuk memulai.</span>
        </div>
      )}
    </section>
  );
}
function Row({ kind, row: r }: { kind: Kind; row: any }) {
  if (kind === "sales-orders") {
    const ordered = r.items.reduce(
        (n: number, x: any) => n + Number(x.quantity),
        0,
      ),
      delivered = r.items.reduce(
        (n: number, x: any) => n + Number(x.deliveredQuantity),
        0,
      ),
      p = ordered ? Math.min(100, (delivered / ordered) * 100) : 0;
    return (
      <tr>
        <CellLink href={`/sales-orders/${r.id}`} a={r.number} />
        <td>{r.customer.companyName}</td>
        <td>{date(r.orderDate)}</td>
        <td>
          {r.items[0]?.productName || "—"}
          {r.items.length > 1 && <small> +{r.items.length - 1} lainnya</small>}
        </td>
        <td>{qty(ordered)}</td>
        <td>{qty(delivered)}</td>
        <td>{qty(ordered - delivered)}</td>
        <td className="money">{money(Number(r.total))}</td>
        <td>
          <Progress value={p} />
        </td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <Menu href={`/sales-orders/${r.id}`} />
      </tr>
    );
  }
  if (kind === "quotations") {
    const days = Math.ceil(
      (new Date(r.validUntil).getTime() - Date.now()) / 86400000,
    );
    return (
      <tr>
        <CellLink href={`/quotations/${r.id}`} a={r.number} />
        <td>{r.customer.companyName}</td>
        <td>{date(r.quotationDate)}</td>
        <td>{date(r.validUntil)}</td>
        <td>
          {r.items[0]?.product.name || "—"}
          {r.items.length > 1 && <small> +{r.items.length - 1} lainnya</small>}
        </td>
        <td className="money">{money(Number(r.total))}</td>
        <td>
          <span
            className={days < 0 ? "due red" : days <= 3 ? "due amber" : "due"}
          >
            {days < 0 ? `Expired ${Math.abs(days)} hari lalu` : `${days} hari`}
          </span>
        </td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <Menu href={`/quotations/${r.id}`} />
      </tr>
    );
  }
  if (kind === "deliveries")
    return (
      <tr>
        <CellLink href={`/deliveries/${r.id}`} a={r.number} />
        <td>{r.salesOrder.number}</td>
        <td>{r.salesOrder.customer.companyName}</td>
        <td>{r.productName}</td>
        <td>{qty(Number(r.netWeight ?? r.plannedQuantity))}</td>
        <td>
          <span className="plate">{r.vehicle?.plateNumber || "—"}</span>
        </td>
        <td>{r.driver?.name || "—"}</td>
        <td>{date(r.createdAt)}</td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <Menu href={`/deliveries/${r.id}`} />
      </tr>
    );
  if (kind === "invoices")
    return (
      <tr>
        <CellLink href={`/invoices/${r.id}`} a={r.number} />
        <td>{r.customer.companyName}</td>
        <td>{r.salesOrder?.number || "—"}</td>
        <td>{date(r.issueDate)}</td>
        <td>{date(r.dueDate)}</td>
        <td className="money">{money(Number(r.total))}</td>
        <td className="money">{money(r.paid)}</td>
        <td className="money strong">{money(r.outstanding)}</td>
        <td>
          <StatusBadge
            status={
              new Date(r.dueDate) < new Date() && r.outstanding > 0
                ? "OVERDUE"
                : r.status
            }
          />
        </td>
        <Menu href={`/invoices/${r.id}`} />
      </tr>
    );
  return (
    <tr>
      <td>
        <Link href={`/suppliers/${r.id}`} className="row-link">
          {r.name}
        </Link>
        <small>{r.code}</small>
      </td>
      <td>
        <span className="category">{r.category.replaceAll("_", " ")}</span>
      </td>
      <td>{r.materials.slice(0, 2).join(", ") || "—"}</td>
      <td>{r.pic}</td>
      <td>{r.phone}</td>
      <td>NET {r.paymentTerms}</td>
      <td className="money">{money(Number(r.purchaseMonthToDate))}</td>
      <td>
        <StatusBadge status={r.status} />
      </td>
      <Menu href={`/suppliers/${r.id}`} />
    </tr>
  );
}
function CellLink({ href, a }: { href: string; a: string }) {
  return (
    <td>
      <Link href={href} className="row-link">
        {a}
      </Link>
    </td>
  );
}
function Menu({ href }: { href: string }) {
  return (
    <td className="row-menu">
      <Link href={href} aria-label="Lihat detail">
        <MoreHorizontal size={18} />
      </Link>
    </td>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div className="mini-progress">
      <span>{Math.round(value)}%</span>
      <i>
        <b style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
function DispatchBoard({ rows, loading }: { rows: any[]; loading: boolean }) {
  const states = ["SCHEDULED", "LOADING", "READY", "IN_TRANSIT", "DELIVERED"];
  return (
    <div className="dispatch-board">
      {states.map((s) => (
        <section key={s}>
          <header>
            <span>{s.replaceAll("_", " ")}</span>
            <b>{rows.filter((r) => r.status === s).length}</b>
          </header>
          <div>
            {loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <div className="dispatch-card skeleton" key={i} />
                ))
              : rows
                  .filter((r) => r.status === s)
                  .map((r) => (
                    <Link
                      href={`/deliveries/${r.id}`}
                      className="dispatch-card"
                      key={r.id}
                    >
                      <strong>{r.number}</strong>
                      <span>{r.salesOrder.customer.companyName}</span>
                      <small>
                        {r.productName} ·{" "}
                        {qty(Number(r.netWeight ?? r.plannedQuantity))}
                      </small>
                      <footer>
                        <span className="plate">
                          {r.vehicle?.plateNumber || "Belum ada armada"}
                        </span>
                        <span>{r.driver?.name || "—"}</span>
                      </footer>
                    </Link>
                  ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function getKpis(k: Kind, s: Record<string, number>) {
  if (k === "sales-orders")
    return [
      {
        label: "TOTAL ORDER",
        value: String(s.total || 0),
        note: "Seluruh sales order",
      },
      {
        label: "NILAI ORDER",
        value: money(s.value || 0),
        note: "Nilai transaksi",
      },
      {
        label: "DALAM PENGIRIMAN",
        value: String(s.shipping || 0),
        note: "Order aktif",
      },
      {
        label: "MENUNGGU PROSES",
        value: String(s.pending || 0),
        note: "Perlu diproses",
        tone: "warn",
      },
    ];
  if (k === "quotations")
    return [
      {
        label: "ACTIVE QUOTATIONS",
        value: String(s.active || 0),
        note: "Pipeline berjalan",
      },
      {
        label: "TOTAL VALUE",
        value: money(s.value || 0),
        note: "Nilai penawaran",
      },
      {
        label: "ACCEPTED",
        value: String(s.accepted || 0),
        note: "Siap dikonversi",
      },
      {
        label: "EXPIRING SOON",
        value: String(s.expiring || 0),
        note: "Dalam 7 hari",
        tone: "warn",
      },
    ];
  if (k === "deliveries")
    return [
      {
        label: "SCHEDULED",
        value: String(s.scheduled || 0),
        note: "Menunggu loading",
      },
      { label: "LOADING", value: String(s.loading || 0), note: "Di area muat" },
      {
        label: "IN TRANSIT",
        value: String(s.inTransit || 0),
        note: "Dalam perjalanan",
        tone: "warn",
      },
      {
        label: "DELIVERED TODAY",
        value: String(s.deliveredToday || 0),
        note: "Selesai hari ini",
        tone: "good",
      },
    ];
  if (k === "invoices")
    return [
      {
        label: "TOTAL RECEIVABLE",
        value: money(s.receivable || 0),
        note: "Piutang berjalan",
      },
      {
        label: "OVERDUE",
        value: money(s.overdue || 0),
        note: "Perlu perhatian",
        tone: "danger",
      },
      {
        label: "DUE THIS WEEK",
        value: money(s.dueWeek || 0),
        note: "Jatuh tempo 7 hari",
        tone: "warn",
      },
      {
        label: "PAID THIS MONTH",
        value: money(s.paidMonth || 0),
        note: "Pembayaran diterima",
        tone: "good",
      },
    ];
  return [
    {
      label: "ACTIVE SUPPLIERS",
      value: String(s.active || 0),
      note: "Pemasok aktif",
    },
    {
      label: "RAW MATERIAL",
      value: String(s.raw || 0),
      note: "Material quarry",
    },
    {
      label: "SPARE PARTS",
      value: String(s.parts || 0),
      note: "Pemasok komponen",
    },
    {
      label: "TOTAL PURCHASE MTD",
      value: money(s.purchase || 0),
      note: "Bulan berjalan",
    },
  ];
}
