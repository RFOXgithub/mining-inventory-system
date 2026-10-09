import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { AppShell } from "./app-shell";

export function Forbidden({ message = "Anda tidak memiliki izin untuk membuka halaman ini." }: { message?: string }) {
  return <AppShell><div className="content"><section className="card"><div className="card-body"><h1>Akses ditolak</h1><p>{message}</p><Link className="btn" href="/login">Masuk dengan akun berizin</Link></div></section></div></AppShell>;
}
export async function PageAccess({ permission, scoped = false, children }: { permission: string; scoped?: boolean; children: React.ReactNode }) {
  const auth = await requirePermission(permission, { scoped });
  if (!auth.ok) { if (auth.status === 401) redirect("/login"); return <Forbidden message={auth.message} />; }
  return children;
}
