import type { Metadata } from "next";
import "./globals.css";
import "./forms.css";
import "./login.css";
import "./operational.css";
import "./enterprise.css";
import "./commercial.css";
import "./commercial-detail.css";
import "./operations-modules.css";
import "./system.css";
import "./account-menu.css";
import "./stonecrusher.css";
import "./masters.css";
import "./commerce-workspace.css";
import "./finance-workspace.css";
import "./core-workspace.css";
import "./stage2.css";
import { SessionProvider } from "@/components/session-provider";

export const metadata: Metadata = { title: "StoneCrusher | Sistem Operasional Pemecah Batu", description: "Sistem manajemen produksi batu, penimbangan, stok, pengiriman, dan penjualan StoneCrusher.", manifest: "/manifest.webmanifest" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><SessionProvider>{children}</SessionProvider></body></html>;
}
