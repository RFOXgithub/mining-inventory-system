import { documentsGET, documentPOST } from "@/features/inventory/handlers";
export const GET = documentsGET("OPNAME");
export const POST = documentPOST("OPNAME");
