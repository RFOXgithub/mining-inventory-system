"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity, Archive, Bell, Boxes, Building2, ClipboardCheck, FileBarChart,
  FileText, Gauge, HardHat, LogOut, PackageSearch, Receipt, Search, Settings,
  ShieldCheck, ShoppingCart, Truck, Users, Warehouse, Weight, Wrench, Menu, X, Mountain,
} from "lucide-react";
import { can, NAV_PERMISSIONS, requiresCompanyScope } from "@/lib/access";
import { useSession } from "./session-provider";
import { clearOffline } from "@/lib/offline-drafts";

const sections = [
  { label: "", items: [["Overview", "/", Gauge]] },
  { label: "OPERATIONS", items: [["Production", "/production", Activity], ["Blending", "/blending", Boxes], ["BBM", "/fuel", Gauge], ["Weighbridge", "/weighbridge", Weight], ["Stockpile", "/stockpile", Archive], ["Inventory", "/inventory", Boxes], ["Opname", "/stock-opnames", ClipboardCheck], ["Internal Issue", "/internal-issues", Archive], ["Deliveries", "/deliveries", Truck]] },
  { label: "COMMERCIAL", items: [["Customers", "/customers", Building2], ["Quotation / SO", "/sales-orders", ShoppingCart], ["Customer PO", "/customer-pos", FileText], ["Invoices", "/invoices", Receipt], ["Receipt / Allocation", "/payments", Receipt], ["Rekonsiliasi / Aging", "/receivables", FileBarChart]] },
  { label: "PROCUREMENT", items: [["Suppliers", "/suppliers", Users], ["Purchase Requests", "/purchase-requests", ClipboardCheck], ["Purchase Orders", "/purchase-orders", PackageSearch]] },
  { label: "HSE & DOCUMENTS", items: [["Surat & Bundle", "/documents", FileText], ["Inspeksi & Pekerja", "/inspections", ClipboardCheck]] },
  { label: "ASSETS", items: [["Aset & Depresiasi", "/assets", HardHat], ["Equipment", "/equipment", HardHat], ["Maintenance", "/maintenance", Wrench], ["Spare Parts", "/spare-parts", Warehouse], ["Vehicles & Drivers", "/vehicles", Truck]] },
  { label: "ANALYTICS", items: [["Approval & Closing", "/approvals", ClipboardCheck], ["Reports", "/reports", FileBarChart], ["Audit Trail", "/audit", ShieldCheck]] },
  { label: "SYSTEM", items: [["Users & Roles", "/users", Users], ["Settings", "/settings", Settings]] },
  { label: "MASTER DATA", items: [["Material & UOM", "/materials", Boxes], ["Plant & Lokasi", "/locations", Building2]] },
] as const;

type Result = { type: string; label: string; detail: string; href: string };

export function AppShell({ children, active = "Overview" }: { children: React.ReactNode; active?: string }) {
  const { session, error: sessionError } = useSession();
  const searchAllowed = !!session && can(session, "dashboard.read") && session.allPlants;
  const visibleSections = sections.map(section => ({ ...section, items: section.items.filter(([, href]) => {
    const permission = NAV_PERMISSIONS[href];
    return session && can(session, permission) && (["/inventory", "/stock-opnames", "/internal-issues", "/production", "/blending", "/fuel", "/sales-orders", "/customer-pos", "/deliveries", "/invoices", "/payments", "/receivables", "/documents", "/assets", "/inspections", "/", "/reports", "/approvals"].includes(href) || !requiresCompanyScope(permission) || session.allPlants);
  }) })).filter(section => section.items.length);
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if (searchAllowed && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
        setAccountOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [searchAllowed]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const payload = await response.json();
        if (response.ok) setResults(payload.data);
        else { setResults([]); setSearchError(payload.message || "Pencarian tidak tersedia."); }
      } catch {
        setResults([]); setSearchError("Koneksi pencarian gagal. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout gagal");
      await clearOffline();
      window.location.assign("/login");
    } catch {
      setLoggingOut(false);
      window.alert("Sesi tidak dapat diakhiri. Silakan coba lagi.");
    }
  }

  return <div className="app">
    <aside id="plant-navigation" className={`sidebar ${navOpen ? "mobile-open" : ""}`}>
      <Link href="/" className="brand" onClick={() => setNavOpen(false)}><div className="brand-mark"><Mountain size={23} aria-hidden="true" /></div><div><strong>StoneCrusher</strong><small>OPERATIONS MANAGEMENT</small></div></Link>
      <nav aria-label="Navigasi utama">{visibleSections.map((section) => <div key={section.label || "root"}>
        {section.label && <div className="nav-section">{section.label}</div>}
        {section.items.map(([name, href, Icon]) => <Link key={name} href={href} aria-current={active === name ? "page" : undefined} onClick={() => setNavOpen(false)} className={`nav-item ${active === name ? "active" : ""}`}><Icon aria-hidden="true" />{name}</Link>)}
      </div>)}</nav>
    </aside>
    <main className="main">
      {sessionError && <p role="status" className="form-error master-error">{sessionError}</p>}
      <header className="topbar">
        <button className="icon-btn mobile-menu" aria-label={navOpen ? "Tutup navigasi" : "Buka navigasi"} aria-expanded={navOpen} aria-controls="plant-navigation" onClick={() => setNavOpen(value => !value)}>{navOpen ? <X size={22} /> : <Menu size={22} />}</button>
        <div className="plant"><small>Cakupan akses</small><strong>{session?.roles.includes("SUPERADMIN") ? "Administrasi teknis" : session?.allPlants ? "Semua plant" : `${session?.plantIds.length ?? 0} plant ditugaskan`}</strong></div>
        {searchAllowed && <button className="search" aria-label="Cari transaksi dan kendaraan" onClick={() => setOpen(true)}><Search size={16} /><span>Cari transaksi, kendaraan...</span><span className="kbd">Ctrl K</span></button>}
        <div className="top-actions">
          <span className="date-label" style={{ fontSize: 11, color: "#717778" }}>{new Date().toLocaleDateString("id-ID")}</span>
          {searchAllowed && <Link className="icon-btn" aria-label="Notifikasi" href="/notifications"><Bell size={19} /></Link>}
          <div className="account-menu">
            <button className="avatar" aria-label={`Buka menu akun ${session?.name ?? ""}`} aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>{session?.name.split(" ").map(part => part[0]).slice(0, 2).join("") || "…"}</button>
            {accountOpen && <div className="account-popover">
              <button type="button" onClick={logout} disabled={loggingOut}><LogOut size={15} />{loggingOut ? "Keluar..." : "Logout"}</button>
            </div>}
          </div>
        </div>
      </header>
      {children}
    </main>
    {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} style={{ alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh" }}>
      <div className="card" onClick={(event) => event.stopPropagation()} style={{ width: "min(640px,92vw)", maxHeight: "75vh", overflow: "auto" }}>
        <div className="card-head"><div className="search" style={{ width: "100%" }}><Search size={17} /><input ref={input} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Cari customer, SO, DO, kendaraan, driver, stockpile..." /><span className="kbd">Esc</span></div></div>
        <div className="card-body" style={{ padding: 8 }}>
          {loading && <div className="muted" style={{ padding: 16 }}>Mencari...</div>}
          {searchError && <div role="alert" className="form-error">{searchError}</div>}
          {!loading && q.length >= 2 && !results.length && <div className="empty-state"><Search /><p>Tidak ada hasil untuk “{q}”.</p></div>}
          {results.map((result, index) => <Link href={result.href} key={`${result.type}-${result.label}-${index}`} className="alert" onClick={() => setOpen(false)}><span className="alert-icon"><Search size={13} /></span><div><strong>{result.label}</strong><p>{result.type} · {result.detail}</p></div></Link>)}
        </div>
      </div>
    </div>}
  </div>;
}
