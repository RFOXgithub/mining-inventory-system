"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { clearOffline, offlineSession, rememberSession } from "@/lib/offline-drafts";

const Context = createContext<{ session: Session | null; error: string; refresh: () => Promise<void> }>({ session: null, error: "", refresh: async () => {} });
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null), [error, setError] = useState("");
  const generation = useRef(0), writes = useRef(Promise.resolve());
  const persist = useCallback((token: number, work: () => Promise<void>) => {
    const queued = writes.current.catch(() => {}).then(async () => { if (token === generation.current) await work(); }); writes.current = queued; return queued;
  }, []);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" }), data = await response.json();
      if (token !== generation.current) return;
      if (!response.ok) { await persist(token, clearOffline); if (token !== generation.current) return; setSession(null); setError("Sesi berakhir. Silakan masuk kembali."); return; }
      await persist(token, () => rememberSession(data.user)).catch(() => {});
      if (token !== generation.current) return;
      setSession(data.user); setError("");
    } catch { if (token !== generation.current) return; await writes.current.catch(() => {}); if (token !== generation.current) return; const cached = !navigator.onLine ? await offlineSession().catch(() => null) : null; if (token !== generation.current) return; setSession(cached); setError(cached ? "Offline: hanya draft produksi/BBM/inspeksi perangkat; kewenangan diperiksa ulang saat sync." : "Sesi tidak dapat dimuat. Hubungkan kembali dan masuk ulang."); }
  }, [persist]);
  useEffect(() => { if (pathname !== "/login") void refresh(); else { const token = ++generation.current; setSession(null); setError(""); void persist(token, clearOffline).catch(() => {}); } return () => { generation.current++; }; }, [refresh, persist, pathname]);
  useEffect(() => { window.addEventListener("online", refresh); window.addEventListener("offline", refresh); return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); }; }, [refresh]);
  return <Context.Provider value={{ session, error, refresh }}>{children}</Context.Provider>;
}
export function useSession() { return useContext(Context); }
