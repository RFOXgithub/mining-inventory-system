"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiError, ErrorNotice, errorValue, Field, MasterDialog, ReasonDialog, requestJson, Verification } from "@/components/master-fields";
import { useSession } from "@/components/session-provider";
import { can } from "@/lib/access";

type Location = { id: string; code: string; name: string; kind: string; plantId: string; stockpileId: string | null; active: boolean; verificationStatus: string; version: number; createdBy: string; updatedBy: string | null };
type Plant = Omit<Location, "plantId" | "stockpileId"> & { locations: Location[]; evidence: string | null };
type Payload = { data: Plant[]; stockpiles: { id: string; code: string; name: string }[] };
type Editor = { resource: "plant" | "location"; row?: Plant | Location; plantId?: string };

export default function Page() {
  const { session } = useSession();
  const [payload, setPayload] = useState<Payload | null>(null), [selectedId, setSelectedId] = useState(""), [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(true), [editor, setEditor] = useState<Editor | null>(null);
  const [reason, setReason] = useState<{ title: string; endpoint: string; body: { version: number }; action: "verify" | "deactivate" } | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setPayload(await requestJson<Payload>("/api/plants")); } catch (error) { setError(errorValue(error)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = payload?.data.find(plant => plant.id === selectedId);
  const allowed = (action: string, plantId?: string) => !!session && can(session, `master.location.${action}`, plantId);
  const saved = () => { setEditor(null); setReason(null); void load(); };
  function actions(row: Plant | Location, resource: "plant" | "location") {
    const plantId = "plantId" in row ? row.plantId : row.id, endpoint = `/api/${resource === "plant" ? "plants" : "locations"}/${row.id}`;
    return <div className="master-inline-actions">{row.active && allowed("update", plantId) && <button className="btn" onClick={() => setEditor({ resource, row, plantId })}>Ubah draft</button>}{row.active && row.verificationStatus !== "VERIFIED" && allowed("verify", plantId) && row.createdBy !== session?.userId && row.updatedBy !== session?.userId && <button className="btn primary" onClick={() => setReason({ title: `Verifikasi ${resource === "plant" ? "plant" : "lokasi"}`, endpoint, body: { version: row.version }, action: "verify" })}>Verifikasi</button>}{row.active && allowed("deactivate", plantId) && <button className="btn" onClick={() => setReason({ title: "Nonaktifkan master", endpoint, body: { version: row.version }, action: "deactivate" })}>Nonaktifkan</button>}</div>;
  }
  return <AppShell active="Plant & Lokasi"><div className="content master-page"><div className="page-head"><div><span className="eyebrow">Master Data</span><h1>Plant, lokasi & tangki</h1><p>Jenis plant terpisah dari stockpile, gudang dan tangki fisik.</p></div>{allowed("create") && session?.allPlants && <button className="btn primary" disabled={!payload} onClick={() => setEditor({ resource: "plant" })}>Plant baru</button>}</div><ErrorNotice error={error} /><div className="master-toolbar"><span>{payload?.data.length ?? 0} plant dalam cakupan Anda</span><button className="btn" onClick={() => void load()} disabled={loading}>Muat ulang</button></div>
    <div className="master-workspace"><section className="card"><div className="data-scroll"><table className="data-table master-list-table"><thead><tr><th>Plant</th><th>Jenis</th><th>Verifikasi</th><th>Detail</th></tr></thead><tbody>{!loading && payload?.data.map(plant => <tr key={plant.id} className={selectedId === plant.id ? "master-selected" : ""}><td><strong>{plant.name}</strong><div>{plant.code}{!plant.active && " · Nonaktif"}</div></td><td>{plant.kind}</td><td><Verification value={plant.verificationStatus} /></td><td><button className="btn" onClick={() => setSelectedId(plant.id)}>Buka</button></td></tr>)}</tbody></table></div>{loading && <p className="card-body" role="status">Memuat plant...</p>}{!loading && !error && !payload?.data.length && <p className="card-body">Belum ada plant. Nama dan lokasi perusahaan tidak dibuat otomatis.</p>}</section>
    <section className="card"><div className="card-body master-detail">{selected ? <><h2>{selected.name}</h2><p>{selected.code} · {selected.kind} · versi {selected.version}</p><Verification value={selected.verificationStatus} /><p className="master-note">Bukti: {selected.evidence || "Belum tersedia"}</p>{actions(selected, "plant")}<h3>Lokasi / tangki</h3>{selected.locations.map(location => <div className="master-location-row" key={location.id}><strong>{location.name}</strong><p>{location.code} · {location.kind}{!location.active && " · Nonaktif"}{location.stockpileId && " · Sumber stockpile legacy tertaut"}</p><Verification value={location.verificationStatus} />{actions(location, "location")}</div>)}{!selected.locations.length && <p>Belum ada lokasi pada plant ini.</p>}{selected.active && allowed("create", selected.id) && <button className="btn" onClick={() => setEditor({ resource: "location", plantId: selected.id })}>Lokasi / tangki baru</button>}</> : <p>Pilih plant untuk mengelola lokasi, tangki dan mapping stockpile.</p>}</div></section></div>
    <p className="master-note">Master tidak memiliki field edit saldo. Mapping stockpile lama tidak mengubah ledger dan tetap memerlukan verifikasi lokasi/plant sebelum dipakai pada workflow baru.</p>
    {editor && payload && <LocationEditor editor={editor} stockpiles={payload.stockpiles} onClose={() => setEditor(null)} onSaved={saved} />}{reason && <ReasonDialog {...reason} onClose={() => setReason(null)} onSaved={saved} />}
  </div></AppShell>;
}

function LocationEditor({ editor, stockpiles, onClose, onSaved }: { editor: Editor; stockpiles: Payload["stockpiles"]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null), { resource, row } = editor;
  return <MasterDialog title={`${row ? "Ubah draft" : "Buat"} ${resource === "plant" ? "plant" : "lokasi / tangki"}`} onClose={onClose} busy={busy}><form onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    const fields = { code: form.get("code"), name: form.get("name"), kind: form.get("kind"), ...(resource === "location" ? { stockpileId: form.get("stockpileId") || null } : {}) };
    const body = row ? { ...fields, version: row.version, reason: form.get("reason") } : { ...fields, ...(resource === "location" ? { plantId: editor.plantId } : {}) };
    try { await requestJson(`/api/${resource === "plant" ? "plants" : "locations"}${row ? `/${row.id}` : ""}`, body, row ? "PATCH" : "POST"); onSaved(); } catch (error) { setError(errorValue(error)); } finally { setBusy(false); }
  }}><div className="card-body master-form"><ErrorNotice error={error} /><Field name="code" label="Kode" errors={error}><input defaultValue={row?.code} required minLength={2} maxLength={30} /></Field><Field name="name" label="Nama" errors={error}><input defaultValue={row?.name} required minLength={2} maxLength={150} /></Field><Field name="kind" label={resource === "plant" ? "Jenis plant" : "Jenis lokasi"} errors={error}><select defaultValue={row?.kind}>{(resource === "plant" ? ["SC", "BP", "AMP"] : ["STOCKPILE", "WAREHOUSE", "TANK", "QUARRY"]).map(kind => <option key={kind}>{kind}</option>)}</select></Field>
    {resource === "location" && <Field name="stockpileId" label="Mapping stockpile lama (opsional)" errors={error}><select defaultValue={row && "stockpileId" in row ? row.stockpileId ?? "" : ""}><option value="">Tanpa mapping legacy</option>{row && "stockpileId" in row && row.stockpileId && <option value={row.stockpileId}>Mapping existing dipertahankan</option>}{stockpiles.map(stockpile => <option value={stockpile.id} key={stockpile.id}>{stockpile.code} · {stockpile.name}</option>)}</select></Field>}
    {row && <Field name="reason" label="Alasan perubahan" errors={error}><textarea required minLength={5} maxLength={500} rows={2} /></Field>}<p className="master-note">Draft belum terverifikasi. Tangki tidak otomatis mempunyai saldo atau kapasitas perkiraan.</p></div><div className="master-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Menyimpan..." : "Simpan draft"}</button></div></form></MasterDialog>;
}
