"use client";
import { cloneElement, ReactElement, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export class ApiError extends Error {
  constructor(message: string, public errors: Record<string, string[]> = {}) { super(message); }
}
export async function requestJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (body !== undefined && typeof navigator !== "undefined" && !navigator.onLine) throw new ApiError("Tindakan ini memerlukan koneksi online. Simpan hanya draft perangkat untuk produksi/BBM/inspeksi.");
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.message ?? "Permintaan gagal.", data.errors ?? {});
  return data;
}
export function errorValue(error: unknown): ApiError { return error instanceof ApiError ? error : new ApiError("Koneksi gagal. Input tetap disimpan; silakan coba kembali."); }

export function Field({ name, label, errors, children }: { name: string; label: string; errors?: ApiError | null; children: ReactElement }) {
  const messages = errors?.errors[name] ?? [], id = `field-${name}`;
  return <label className="master-field" htmlFor={id}><span id={`${id}-label`}>{label}</span>{cloneElement(children as ReactElement<Record<string, unknown>>, { id, name, "aria-labelledby": `${id}-label`, "aria-invalid": messages.length ? true : undefined, "aria-describedby": messages.length ? `${id}-error` : undefined })}{messages.length > 0 && <small id={`${id}-error`} className="form-error">{messages.join(" ")}</small>}</label>;
}
export function ErrorNotice({ error }: { error: ApiError | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return error ? <div ref={ref} tabIndex={-1} role="alert" className="form-error master-error"><strong>{error.message}</strong>{Object.entries(error.errors).length > 0 && <ul>{Object.entries(error.errors).map(([name, messages]) => <li key={name}><a href={`#field-${name}`}>{messages.join(" ")}</a></li>)}</ul>}</div> : null;
}
export function MasterDialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="master-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="card-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Tutup dialog" onClick={onClose} disabled={busy}><X size={20} /></button></div>{children}</dialog>;
}
export function ReasonDialog({ title, endpoint, body, action, method = "PATCH", onClose, onSaved }: { title: string; endpoint: string; body?: Record<string, unknown>; action: "verify" | "deactivate"; method?: string; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null);
  const field = action === "verify" ? "evidence" : "reason";
  return <MasterDialog title={title} onClose={onClose} busy={busy}><form onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { await requestJson(endpoint, { ...body, action, [field]: form.get(field) }, method); onSaved(); }
    catch (error) { setError(errorValue(error)); } finally { setBusy(false); }
  }}><div className="card-body"><ErrorNotice error={error} /><Field name={field} label={action === "verify" ? "Sumber / referensi bukti verifikasi" : "Alasan nonaktif"} errors={error}><textarea required minLength={5} maxLength={1000} rows={3} /></Field></div><div className="master-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Memproses..." : action === "verify" ? "Verifikasi" : "Nonaktifkan"}</button></div></form></MasterDialog>;
}
export function Verification({ value }: { value: string }) { return <span className={`badge ${value === "VERIFIED" ? "green" : "amber"}`}>{value === "VERIFIED" ? "Terverifikasi" : "Belum terverifikasi"}</span>; }
