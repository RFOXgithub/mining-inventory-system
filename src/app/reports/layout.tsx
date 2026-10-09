import { PageAccess } from "@/components/page-access";
export default function Layout({ children }: { children: React.ReactNode }) { return <PageAccess permission="reports.read" scoped>{children}</PageAccess>; }
