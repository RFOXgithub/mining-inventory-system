import type { Session } from "@/lib/auth";
import { runSchema, type RunInput } from "@/features/operations/schema";
import type { InspectionInput } from "@/features/stage2/schema";
import { inspectionDraftSchema } from "@/features/stage2/offline-schema";
import { can } from "@/lib/access";

export type DraftPayload = RunInput | InspectionInput;
export type LocalDraft<P extends DraftPayload = DraftPayload> = { id: string; ownerId: string; deviceId: string; revision: number; updatedAt: string; payload: P; sourceId?: string; version: number; state: "UNSYNCED" | "SYNCED" | "CONFLICT" | "INVALID"; error?: string };
const draftPermission = (p: DraftPayload) => `${p.kind === "INSPECTION" ? "inspection" : p.kind.startsWith("FUEL_") ? "fuel" : "production"}.create`;
const database = "quarryflow-drafts-v1";
const event = () => window.dispatchEvent(new Event("quarryflow-drafts"));
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("data"); request.result.createObjectStore("drafts", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function read<T>(store: string, key?: string): Promise<T> {
  const db = await open();
  try { return await new Promise<T>((resolve, reject) => { const request = key ? db.transaction(store).objectStore(store).get(key) : db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
}
async function write(store: string, key: string | undefined, value: unknown) {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"), table = tx.objectStore(store); if (key) table.put(value, key); else table.put(value); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
}
export async function clearOffline() {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(["data", "drafts"], "readwrite"); tx.objectStore("data").clear(); tx.objectStore("drafts").clear(); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration?.active) await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel(), timeout = setTimeout(() => { channel.port1.close(); reject(new Error("Penghapusan cache belum selesai. Coba lagi saat koneksi tersedia.")); }, 30000);
    channel.port1.onmessage = message => { if (message.data?.cleared) { clearTimeout(timeout); channel.port1.close(); resolve(); } };
    registration.active!.postMessage({ type: "CLEAR" }, [channel.port2]);
  });
  if ("caches" in window) { for (const key of await caches.keys()) if (key.startsWith("quarryflow-shell-")) await caches.delete(key); }
  event();
}
type OfflineSession = { session: Session; expiresAt: number };
export async function rememberSession(session: Session) {
  const previous = await read<OfflineSession | undefined>("data", "session");
  const permissions = ["production.read", "production.create", "fuel.read", "fuel.create", "inspection.read", "inspection.create"].filter(p => can(session, p));
  const limited: Session = { userId: session.userId, name: session.name, email: "", roles: [...session.roles].sort(), functions: [...session.functions].sort(), plantIds: [...session.plantIds].sort(), allPlants: session.allPlants, sessionVersion: session.sessionVersion, permissions };
  if (previous && JSON.stringify(previous.session) !== JSON.stringify(limited)) await clearOffline();
  if (!permissions.some(p => p.endsWith(".create"))) { await clearOffline(); return; }
  await write("data", "session", { session: limited, expiresAt: Date.now() + 3600000 });
}
export async function offlineSession() {
  const saved = await read<OfflineSession | undefined>("data", "session");
  if (saved && saved.expiresAt > Date.now()) return saved.session;
  await clearOffline(); return null;
}
export async function rememberReferences<T>(actor: Session, domain: string, value: T) {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("data", "readwrite"), store = tx.objectStore("data"), request = store.get("session");
    request.onsuccess = () => { const saved = request.result as OfflineSession | undefined; if (saved && saved.expiresAt > Date.now() && saved.session.userId === actor.userId && saved.session.sessionVersion === actor.sessionVersion && saved.session.allPlants === actor.allPlants && JSON.stringify([...saved.session.plantIds].sort()) === JSON.stringify([...actor.plantIds].sort())) store.put(value, `refs:${actor.userId}:${domain}`); };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function offlineReferences<T>(ownerId: string, domain: string) { return read<T | undefined>("data", `refs:${ownerId}:${domain}`); }
export async function localDrafts(ownerId: string) { return (await read<LocalDraft[]>("drafts")).filter(d => d.ownerId === ownerId); }
export async function saveLocalDraft(ownerId: string, payload: DraftPayload, source?: { id: string; version: number }, expectedRevision?: number) {
  payload = payload.kind === "INSPECTION" ? inspectionDraftSchema.parse(payload) : runSchema.parse(payload);
  if (payload.kind === "BLENDING") throw new Error("Draft perangkat hanya untuk produksi dan BBM.");
  const session = await offlineSession();
  if (!session || session.userId !== ownerId || !can(session, draftPermission(payload), payload.plantId || undefined)) throw new Error("Izin draft perangkat berakhir. Hubungkan kembali dan masuk ulang.");
  let deviceId = await read<string | undefined>("data", "device");
  if (!deviceId) { deviceId = crypto.randomUUID(); await write("data", "device", deviceId); }
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["data", "drafts"], "readwrite"), store = tx.objectStore("drafts"), auth = tx.objectStore("data").get("session");
    auth.onsuccess = () => {
      const saved = auth.result as OfflineSession | undefined;
      if (!saved || saved.expiresAt <= Date.now() || saved.session.userId !== ownerId || !can(saved.session, draftPermission(payload), payload.plantId || undefined)) { tx.abort(); reject(new Error("Izin draft perangkat berakhir.")); return; }
      const request = store.get(payload.requestKey); request.onsuccess = () => {
      const old = request.result as LocalDraft | undefined;
      if (old && (old.ownerId !== ownerId || old.revision !== expectedRevision)) { tx.abort(); reject(new Error("Draft perangkat berubah di tab lain. Muat ulang draft.")); return; }
      store.put({ id: payload.requestKey, ownerId, deviceId, revision: (old?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), payload, sourceId: old?.sourceId ?? source?.id, version: old?.version ?? source?.version ?? 0, state: "UNSYNCED" } satisfies LocalDraft);
      };
    };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error("Draft tidak tersimpan."));
  }); } finally { db.close(); }
  event();
}
async function updateIfCurrent(draft: LocalDraft, change: Partial<LocalDraft>) {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), request = store.get(draft.id); request.onsuccess = () => { const current = request.result as LocalDraft | undefined; if (current?.ownerId === draft.ownerId) {
    // Preserve edits made while sync was in flight, but retain its acknowledged server version.
    store.put(current.revision === draft.revision ? { ...current, ...change } : { ...current, sourceId: change.sourceId ?? current.sourceId, version: change.version ?? current.version, state: "UNSYNCED" });
  } }; tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  event();
}
export async function syncLocalDraft(draft: LocalDraft) {
  if (!navigator.onLine) throw new Error("Sinkronisasi memerlukan koneksi online.");
  const work = async () => {
    const current = await read<LocalDraft | undefined>("drafts", draft.id);
    if (!current || current.revision !== draft.revision) throw new Error("Draft berubah. Muat ulang sebelum sinkronisasi.");
    try {
      const response = await fetch(current.payload.kind === "INSPECTION" ? "/api/stage2/sync" : "/api/operations/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientDraftId: current.id, deviceId: current.deviceId, clientUpdatedAt: current.updatedAt, ...(current.sourceId ? { sourceId: current.sourceId } : {}), version: current.version, payload: current.payload }) });
      const result = await response.json();
      if (response.status === 401 || response.status === 403) { await clearOffline(); throw new Error(result.message ?? "Izin sinkronisasi dicabut. Masuk kembali."); }
      if (!response.ok) { await updateIfCurrent(current, { state: response.status === 409 ? "CONFLICT" : "INVALID", error: result.message ?? "Validasi server gagal." }); return; }
      await updateIfCurrent(current, { sourceId: result.data.sourceId, version: result.data.version, state: "SYNCED", error: undefined });
    } catch (error) { if (!navigator.onLine || error instanceof TypeError) { await updateIfCurrent(current, { state: "UNSYNCED", error: "Koneksi terputus; UUID tetap sama untuk retry." }); return; } throw error; }
  };
  if (navigator.locks) await navigator.locks.request(`quarryflow-sync:${draft.id}`, work); else await work();
}
export async function forkLocalDraft(draft: LocalDraft) {
  await saveLocalDraft(draft.ownerId, { ...draft.payload, requestKey: crypto.randomUUID() });
}
export async function removeLocalDraft(draft: LocalDraft) {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), request = store.get(draft.id); request.onsuccess = () => { if (request.result?.ownerId === draft.ownerId && request.result?.revision === draft.revision) store.delete(draft.id); else { tx.abort(); reject(new Error("Draft berubah di tab lain.")); } }; tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  event();
}
export async function prepareOfflineShell() {
  if (!("serviceWorker" in navigator)) return;
  const saved = await read<OfflineSession | undefined>("data", "session");
  if (!saved || saved.expiresAt <= Date.now()) return;
  await navigator.serviceWorker.register("/draft-worker.js");
  const registration = await navigator.serviceWorker.ready;
  const urls = [...performance.getEntriesByType("resource").map(r => r.name), ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map(s => s.src), ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(s => s.href)];
  registration.active?.postMessage({ type: "PREPARE", urls, lease: JSON.stringify(saved.session) });
}
