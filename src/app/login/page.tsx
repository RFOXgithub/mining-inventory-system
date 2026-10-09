"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, Factory, LoaderCircle, LockKeyhole, Mountain, Truck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(result.message);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : result.destination || "/");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark"><Mountain size={23} aria-hidden="true" /></div>
          <div>
            <strong>StoneCrusher</strong>
            <small>OPERATIONS MANAGEMENT</small>
          </div>
        </div>
        <span className="eyebrow">Akses sistem operasional</span>
        <h1>Selamat datang kembali.</h1>
        <p>Akun demo sudah diisi. Klik Masuk untuk melihat aplikasi.</p>
        <form onSubmit={submit}>
          <label>
            <span>Email *</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              defaultValue="admin@quarryflow.co.id"
              required
            />
          </label>
          <label>
            <span>Kata sandi *</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue="QuarryFlow2026!"
              minLength={8}
              required
            />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary" disabled={loading}>
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <LockKeyhole size={17} />
            )}{" "}
            {loading ? "Memverifikasi..." : "Masuk ke StoneCrusher"}
            {!loading && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
        <div className="login-footer"><LockKeyhole size={14} aria-hidden="true" /> Akses sesuai peran dan izin pengguna</div>
      </section>
      <aside className="login-visual">
        <div className="login-visual-top"><Mountain size={28} aria-hidden="true" /><span>STONECRUSHER / PLANT OPERATIONS</span></div>
        <div className="login-visual-content">
          <span className="login-location">CILEUNGSI · JAWA BARAT</span>
          <h2>Dari batu.<br />Menjadi kemajuan.</h2>
          <p>Kendalikan produksi, pantau persediaan, dan kelola pengiriman dalam satu sistem operasional yang terhubung.</p>
          <div className="login-features">
            <div><Factory size={22} aria-hidden="true" /><strong>Produksi</strong><small>Pantau output plant</small></div>
            <div><Boxes size={22} aria-hidden="true" /><strong>Persediaan</strong><small>Kontrol stok material</small></div>
            <div><Truck size={22} aria-hidden="true" /><strong>Pengiriman</strong><small>Kelola distribusi</small></div>
          </div>
        </div>
        <div className="login-visual-footer">SISTEM OPERASIONAL PEMECAH BATU <span>StoneCrusher</span></div>
      </aside>
    </main>
  );
}
