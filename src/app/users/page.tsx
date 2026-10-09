"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ApiError, ErrorNotice, errorValue, Field, MasterDialog, requestJson } from "@/components/master-fields";
import { allowedActions, FINAL_ROLES, FinalRole } from "@/lib/access";

type User = { id: string; name: string; email: string; status: string; sessionVersion: number; functions: string[]; actionPermissions: string[]; allPlants: boolean; plantScopes: { plantId: string }[]; roles: { role: { code: string } }[] };
type Payload = { data: User[]; plants: { id: string; name: string }[]; meta: { page: number; pageSize: number; total: number } };

export default function Page() {
  const [payload, setPayload] = useState<Payload | null>(null), [q, setQ] = useState(""), [page, setPage] = useState(1);
  const [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(true), [tab, setTab] = useState("users");
  const [editor, setEditor] = useState<{ row?: User } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPayload(await requestJson<Payload>(`/api/users?q=${encodeURIComponent(q)}&page=${page}`)); }
    catch (error) { setError(errorValue(error)); } finally { setLoading(false); }
  }, [q, page]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  return <AppShell active="Users & Roles"><div className="content master-page"><div className="page-head"><div><span className="eyebrow">Pengaturan / Akses</span><h1>User & akses</h1><p>Lima role, fungsi ADMIN dan cakupan action/plant.</p></div><button className="btn primary" onClick={() => setEditor({})} disabled={!payload}>User baru</button></div>
    <div className="report-tabs"><button aria-pressed={tab === "users"} onClick={() => setTab("users")}>User</button><button aria-pressed={tab === "matrix"} onClick={() => setTab("matrix")}>Matriks role / fungsi</button></div>
    <ErrorNotice error={error} />
    {tab === "users" ? <><div className="master-toolbar"><label>Cari user <input value={q} onChange={event => { setQ(event.target.value); setPage(1); }} placeholder="Nama atau email" /></label><button className="btn" onClick={() => void load()} disabled={loading}>Muat ulang</button></div>
      <section className="card"><div className="data-scroll"><table className="data-table master-list-table"><thead><tr><th>User</th><th>Role / fungsi</th><th>Cakupan</th><th>Status</th><th>Action</th></tr></thead><tbody>{!loading && payload?.data.map(row => <tr key={row.id}><td><strong>{row.name}</strong><div>{row.email}</div></td><td>{row.roles.map(r => r.role.code).join(", ")}<div>{row.functions.join(" / ") || "—"}</div></td><td>{row.allPlants ? "Semua plant (eksplisit)" : row.plantScopes.map(scope => payload.plants.find(p => p.id === scope.plantId)?.name ?? "Plant nonaktif").join(", ") || "Belum ditugaskan"}</td><td><StatusBadge status={row.status} /></td><td><button className="btn" onClick={() => setEditor({ row })}>Ubah akses</button></td></tr>)}</tbody></table></div>{loading && <p className="card-body" role="status">Memuat user...</p>}{!loading && !error && !payload?.data.length && <p className="card-body">Belum ada user yang cocok.</p>}</section>
      <div className="master-pagination"><button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Sebelumnya</button><span>Halaman {page} · {payload?.meta.total ?? 0} user</span><button className="btn" disabled={loading || page * 10 >= (payload?.meta.total ?? 0)} onClick={() => setPage(p => p + 1)}>Berikutnya</button></div></> :
      <section className="card"><p className="card-body master-note">Matriks ini adalah batas maksimum role. Akses efektif tetap memerlukan grant action dan plant pada user. SUPERADMIN hanya administrasi teknis; PC dan Finance memakai role ADMIN.</p><div className="data-scroll"><table className="data-table master-matrix"><thead><tr><th>Role / fungsi</th><th>Action yang dapat diberikan</th><th>Plant</th></tr></thead><tbody>{FINAL_ROLES.flatMap(role => (role === "ADMIN" ? ["PC", "FINANCE"] : [""]).map(fn => <tr key={`${role}-${fn}`}><td>{role}{fn ? ` / ${fn}` : ""}</td><td>{allowedActions(role, fn ? [fn] : []).map(action => <small key={action}>{action}</small>)}</td><td>{role === "SUPERADMIN" ? "Konfigurasi teknis" : "Plant tertentu atau semua plant secara eksplisit"}</td></tr>))}</tbody></table></div></section>}
    {editor && payload && <UserEditor row={editor.row} plants={payload.plants} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} />}
  </div></AppShell>;
}

function UserEditor({ row, plants, onClose, onSaved }: { row?: User; plants: Payload["plants"]; onClose: () => void; onSaved: () => void }) {
  const existingRole = row?.roles.find(r => FINAL_ROLES.includes(r.role.code as FinalRole))?.role.code;
  const [role, setRole] = useState<FinalRole>(FINAL_ROLES.includes(existingRole as FinalRole) ? existingRole as FinalRole : "ADMIN");
  const [functions, setFunctions] = useState(row?.functions ?? []), [permissions, setPermissions] = useState(row?.actionPermissions ?? []);
  const [plantIds, setPlantIds] = useState(row?.plantScopes.map(scope => scope.plantId) ?? []), [allPlants, setAllPlants] = useState(row?.allPlants ?? false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null);
  const actions = allowedActions(role, functions);
  function toggle(values: string[], value: string) { return values.includes(value) ? values.filter(v => v !== value) : [...values, value]; }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    const assignment = { role, functions: role === "ADMIN" ? functions : [], permissions: permissions.filter(p => actions.includes(p)), plantIds: allPlants || role === "SUPERADMIN" ? [] : plantIds, allPlants: role === "SUPERADMIN" ? false : allPlants };
    const password = String(form.get("password") ?? "");
    const body = row ? { name: form.get("name"), status: form.get("status"), sessionVersion: row.sessionVersion, assignment, ...(password ? { newPassword: password } : {}) } : { name: form.get("name"), email: form.get("email"), password, assignment };
    try { await requestJson(row ? `/api/users/${row.id}` : "/api/users", body, row ? "PATCH" : "POST"); onSaved(); }
    catch (error) { setError(errorValue(error)); } finally { setBusy(false); }
  }
  return <MasterDialog title={row ? `Akses ${row.name}` : "User baru"} onClose={onClose} busy={busy}><form onSubmit={save}><div className="card-body master-form"><ErrorNotice error={error} />
    <Field name="name" label="Nama" errors={error}><input defaultValue={row?.name} required minLength={3} maxLength={100} /></Field>
    {!row && <Field name="email" label="Email" errors={error}><input type="email" required autoComplete="off" /></Field>}
    <Field name="password" label={row ? "Kata sandi baru (opsional)" : "Kata sandi"} errors={error}><input type="password" autoComplete="new-password" required={!row} minLength={10} maxLength={128} /></Field>
    {row && <Field name="status" label="Status" errors={error}><select defaultValue={row.status}>{["ACTIVE", "INACTIVE", "LOCKED"].map(status => <option key={status}>{status}</option>)}</select></Field>}
    <Field name="role" label="Role final" errors={error}><select value={role} onChange={event => { setRole(event.target.value as FinalRole); setFunctions([]); setPermissions([]); }}>{FINAL_ROLES.map(role => <option key={role}>{role}</option>)}</select></Field>
    <fieldset className="master-checks" id="field-assignment"><legend>Fungsi ADMIN</legend>{["PC", "FINANCE"].map(fn => <label key={fn}><input type="checkbox" checked={role === "ADMIN" && functions.includes(fn)} disabled={role !== "ADMIN"} onChange={() => { setFunctions(toggle(functions, fn)); setPermissions([]); }} />{fn === "PC" ? "Project Control" : "Finance"}</label>)}</fieldset>
    <fieldset className="master-checks"><legend>Grant action eksplisit</legend>{actions.map(action => <label key={action}><input type="checkbox" checked={permissions.includes(action)} onChange={() => setPermissions(toggle(permissions, action))} />{action}</label>)}</fieldset>
    {role !== "SUPERADMIN" && <fieldset className="master-checks"><legend>Cakupan plant</legend><label><input type="checkbox" checked={allPlants} onChange={event => { setAllPlants(event.target.checked); setPlantIds([]); }} />Semua plant (termasuk plant baru)</label>{!allPlants && plants.map(plant => <label key={plant.id}><input type="checkbox" checked={plantIds.includes(plant.id)} onChange={() => setPlantIds(toggle(plantIds, plant.id))} />{plant.name}</label>)}{!allPlants && !plants.length && <p>Belum ada plant. Cakupan semua plant hanya diberikan bila memang berwenang menyiapkan master awal.</p>}</fieldset>}
    <p className="master-note">Perubahan akses atau password mengakhiri session lama. Role legacy tetap tersimpan dalam histori audit, dan harus dipetakan secara eksplisit.</p>
  </div><div className="master-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Menyimpan..." : "Simpan user & akses"}</button></div></form></MasterDialog>;
}
