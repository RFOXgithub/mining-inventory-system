import { CoreWorkspace } from "@/components/core-workspace";
import { PageAccess } from "@/components/page-access";
export default function Page() { return <PageAccess permission="dashboard.read" scoped><CoreWorkspace mode="dashboard" /></PageAccess>; }
