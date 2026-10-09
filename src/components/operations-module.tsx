"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  | "purchase-requests"
  | "purchase-orders"
  | "equipment"
  | "maintenance"
  | "spare-parts";
const cfg = {
  "purchase-requests": {
    active: "Purchase Requests",
    crumb: "PROCUREMENT / PURCHASE REQUESTS",
    title: "Purchase Requests",
    sub: "Kelola permintaan pembelian material, spare part, dan kebutuhan operasional quarry.",
    empty: "Belum ada permintaan pembelian pada periode ini.",
    statuses: [
      "DRAFT",
      "SUBMITTED",
      "WAITING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "CONVERTED",
      "CANCELLED",
    ],
  },
  "purchase-orders": {
    active: "Purchase Orders",
    crumb: "PROCUREMENT / PURCHASE ORDERS",
    title: "Purchase Orders",
    sub: "Kelola pesanan pembelian, supplier, penerimaan barang, dan progres pemenuhan.",
    empty: "Belum ada Purchase Order aktif.",
    statuses: [
      "DRAFT",
      "WAITING_APPROVAL",
      "APPROVED",
      "ORDERED",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "CANCELLED",
    ],
  },
  equipment: {
    active: "Equipment",
    crumb: "ASSETS / EQUIPMENT",
    title: "Equipment",
    sub: "Pantau kondisi, jam operasi, maintenance, dan availability peralatan quarry.",
    empty: "Belum ada equipment yang terdaftar.",
    statuses: [
      "OPERATIONAL",
      "MAINTENANCE_DUE",
      "UNDER_MAINTENANCE",
      "BREAKDOWN",
      "INACTIVE",
    ],
  },
  maintenance: {
    active: "Maintenance",
    crumb: "ASSETS / MAINTENANCE",
    title: "Maintenance",
    sub: "Kelola preventive maintenance, corrective repair, inspection, dan equipment downtime.",
    empty: "Tidak ada maintenance yang dijadwalkan.",
    statuses: [
      "SCHEDULED",
      "IN_PROGRESS",
      "WAITING_PART",
      "TESTING",
      "COMPLETED",
      "CANCELLED",
    ],
  },
  "spare-parts": {
    active: "Spare Parts",
    crumb: "ASSETS / SPARE PARTS",
    title: "Spare Parts",
    sub: "Pantau persediaan komponen kritis untuk menjaga availability equipment.",
    empty: "Belum ada spare part yang terdaftar.",
    statuses: ["ACTIVE", "INACTIVE"],
  },
} as const;
const money = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  date = (v: string) =>
    new Date(v).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  num = (n: number) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
export function OperationsModule({ kind }: { kind: Kind }) {
  const c = cfg[kind],
    [payload, setPayload] = useState<any>(),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const p = new URLSearchParams({
      q,
      status,
      page: String(page),
      pageSize: "10",
    });
    try {
      const r = await fetch(`/api/operations/${kind}?${p}`),
        j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setPayload(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data tidak dapat dimuat");
    } finally {
      setLoading(false);
    }
  }, [kind, q, status, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const rows = payload?.data || [],
    pages = Math.max(1, Math.ceil((payload?.meta.total || 0) / 10));
  function csv() {
    if (!rows.length) return;
    const blob = new Blob(
        [
          rows
            .map((r: any) =>
              [r.number || r.code, r.name || r.department, r.status].join(","),
            )
            .join("\n"),
        ],
        { type: "text/csv" },
      ),
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
          <button className="btn" onClick={csv} disabled={!rows.length}>
            <Download size={15} />
            Export
          </button>
        </div>
        <Kpis
          kind={kind}
          s={payload?.summary || {}}
          loading={loading && !payload}
        />
        <div className="filter-bar">
          <label className="erp-search">
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={`Cari ${c.title.toLowerCase()}...`}
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
        </div>
        {error ? (
          <div className="erp-error">
            <strong>Data tidak dapat dimuat</strong>
            <span>{error}</span>
            <button className="btn" onClick={load}>
              Coba lagi
            </button>
          </div>
        ) : (
          <Table kind={kind} rows={rows} loading={loading} empty={c.empty} />
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
function Kpis({ kind, s, loading }: { kind: Kind; s: any; loading: boolean }) {
  const map =
    kind === "purchase-requests"
      ? [
          ["TOTAL REQUEST", s.total],
          ["WAITING APPROVAL", s.waiting],
          ["APPROVED", s.approved],
          ["ESTIMATED VALUE", money(s.value || 0)],
        ]
      : kind === "purchase-orders"
        ? [
            ["ACTIVE PO", s.active],
            ["TOTAL VALUE", money(s.value || 0)],
            ["WAITING DELIVERY", s.waiting],
            ["OVERDUE DELIVERY", s.overdue],
          ]
        : kind === "equipment"
          ? [
              ["TOTAL EQUIPMENT", s.total],
              ["OPERATIONAL", s.operational],
              ["MAINTENANCE", s.maintenance],
              ["BREAKDOWN", s.breakdown],
            ]
          : kind === "maintenance"
            ? [
                ["SCHEDULED", s.scheduled],
                ["IN PROGRESS", s.progress],
                ["OVERDUE", s.overdue],
                ["MAINTENANCE COST", money(s.cost || 0)],
              ]
            : [
                ["TOTAL PARTS", s.total],
                ["LOW STOCK", s.low],
                ["OUT OF STOCK", s.out],
                ["INVENTORY VALUE", money(s.value || 0)],
              ];
  return (
    <div className="erp-kpis">
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
            <div className="erp-kpi skeleton" key={i} />
          ))
        : map.map(([l, v]) => (
            <div className="erp-kpi" key={String(l)}>
              <small>{l}</small>
              <strong>{v ?? 0}</strong>
              <span>Data aktual</span>
            </div>
          ))}
    </div>
  );
}
function Table({
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
  const heads =
    kind === "purchase-requests"
      ? [
          "PR Number",
          "Request Date",
          "Requester",
          "Department",
          "Items",
          "Required",
          "Estimated",
          "Priority",
          "Status",
          "",
        ]
      : kind === "purchase-orders"
        ? [
            "PO Number",
            "Supplier",
            "PR Reference",
            "Order Date",
            "Expected",
            "Items",
            "Total",
            "Receiving",
            "Status",
            "",
          ]
        : kind === "equipment"
          ? [
              "Equipment",
              "Category",
              "Location",
              "Hour Meter",
              "Next Maintenance",
              "Status",
              "Last Activity",
              "",
            ]
          : kind === "maintenance"
            ? [
                "Maintenance",
                "Equipment",
                "Type",
                "Priority",
                "Scheduled",
                "Technician",
                "Downtime",
                "Cost",
                "Status",
                "",
              ]
            : [
                "Part",
                "Category",
                "Compatible Equipment",
                "Location",
                "Stock",
                "Minimum",
                "Unit Cost",
                "Stock Status",
                "",
              ];
  return (
    <section className="erp-table-wrap">
      <div className="data-scroll">
        <table className="data-table erp-table">
          <thead>
            <tr>
              {heads.map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {heads.map((_, j) => (
                      <td key={j}>
                        <i />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => <Row kind={kind} r={r} key={r.id} />)}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && (
        <div className="erp-empty">
          <strong>{empty}</strong>
          <span>Ubah filter untuk melihat data lainnya.</span>
        </div>
      )}
    </section>
  );
}
function Row({ kind, r }: { kind: Kind; r: any }) {
  const link = `/${kind}/${r.id}`;
  if (kind === "purchase-requests")
    return (
      <tr>
        <C href={link} v={r.number} />
        <td>{date(r.requestDate)}</td>
        <td>{r.requesterName}</td>
        <td>{r.department}</td>
        <td>{r.items.length} item</td>
        <td>{date(r.requiredDate)}</td>
        <td>{money(Number(r.estimatedTotal))}</td>
        <td>
          <Priority value={r.priority} />
        </td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <M href={link} />
      </tr>
    );
  if (kind === "purchase-orders") {
    const ordered = r.items.reduce(
        (n: number, x: any) => n + Number(x.quantity),
        0,
      ),
      received = r.items.reduce(
        (n: number, x: any) => n + Number(x.receivedQuantity),
        0,
      );
    return (
      <tr>
        <C href={link} v={r.number} />
        <td>{r.supplier.name}</td>
        <td>{r.purchaseRequest?.number || "—"}</td>
        <td>{date(r.orderDate)}</td>
        <td>{date(r.expectedDate)}</td>
        <td>{r.items.length} item</td>
        <td>{money(Number(r.total))}</td>
        <td>
          <Progress v={ordered ? (received / ordered) * 100 : 0} />
        </td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <M href={link} />
      </tr>
    );
  }
  if (kind === "equipment") {
    const due =
      Number(r.lastMaintenanceHour) +
      Number(r.maintenanceInterval) -
      Number(r.hourMeter);
    return (
      <tr>
        <td>
          <Link className="row-link" href={link}>
            {r.name}
          </Link>
          <small>{r.code}</small>
        </td>
        <td>{r.category}</td>
        <td>{r.location}</td>
        <td>{num(Number(r.hourMeter))} h</td>
        <td className={due < 0 ? "due red" : "due amber"}>
          {due < 0 ? `Overdue ${num(-due)} h` : `Due in ${num(due)} h`}
        </td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <td>{r.maintenances[0] ? date(r.maintenances[0].updatedAt) : "—"}</td>
        <M href={link} />
      </tr>
    );
  }
  if (kind === "maintenance") {
    const cost =
        Number(r.laborCost) +
        Number(r.externalCost) +
        Number(r.otherCost) +
        r.spareParts.reduce(
          (n: number, x: any) => n + Number(x.quantity) * Number(x.unitCost),
          0,
        ),
      down = r.startedAt
        ? (new Date(r.completedAt || Date.now()).getTime() -
            new Date(r.startedAt).getTime()) /
          3600000
        : 0;
    return (
      <tr>
        <C href={link} v={r.number} />
        <td>{r.equipment.name}</td>
        <td>{r.type}</td>
        <td>
          <Priority value={r.priority} />
        </td>
        <td>{date(r.scheduledAt)}</td>
        <td>{r.technician || "—"}</td>
        <td>{num(down)} h</td>
        <td>{money(cost)}</td>
        <td>
          <StatusBadge status={r.status} />
        </td>
        <M href={link} />
      </tr>
    );
  }
  const stock = Number(r.currentStock),
    state =
      r.status === "INACTIVE"
        ? "INACTIVE"
        : stock <= 0
          ? "OUT_OF_STOCK"
          : stock <= Number(r.minimumStock)
            ? "LOW_STOCK"
            : "AVAILABLE";
  return (
    <tr>
      <td>
        <Link className="row-link" href={link}>
          {r.name}
        </Link>
        <small>{r.code}</small>
      </td>
      <td>{r.category}</td>
      <td>
        {r.equipment
          .map((x: any) => x.equipment.name)
          .slice(0, 2)
          .join(", ") || "—"}
      </td>
      <td>{r.storageLocation}</td>
      <td>
        {num(stock)} {r.unit}
      </td>
      <td>{num(Number(r.minimumStock))}</td>
      <td>{money(Number(r.unitCost))}</td>
      <td>
        <StatusBadge status={state} />
      </td>
      <M href={link} />
    </tr>
  );
}
function C({ href, v }: { href: string; v: string }) {
  return (
    <td>
      <Link className="row-link" href={href}>
        {v}
      </Link>
    </td>
  );
}
function M({ href }: { href: string }) {
  return (
    <td className="row-menu">
      <Link href={href}>
        <MoreHorizontal size={18} />
      </Link>
    </td>
  );
}
function Priority({ value }: { value: string }) {
  return <span className={`priority ${value.toLowerCase()}`}>{value}</span>;
}
function Progress({ v }: { v: number }) {
  return (
    <div className="mini-progress">
      <span>{Math.round(v)}%</span>
      <i>
        <b style={{ width: `${Math.min(v, 100)}%` }} />
      </i>
    </div>
  );
}
