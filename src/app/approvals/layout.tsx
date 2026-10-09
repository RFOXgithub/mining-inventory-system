import { PageAccess } from "@/components/page-access";
export default function Layout({ children }: { children: React.ReactNode }) { return <PageAccess permission="approvals.read" scoped>{children}</PageAccess>; }
