export const FINAL_ROLES = ["SUPERADMIN", "DIREKTUR", "ADMIN", "MANAGER", "HSE"] as const;
export type FinalRole = typeof FINAL_ROLES[number];
export type AccessActor = {
  userId: string;
  roles: string[];
  functions: string[];
  permissions: string[];
  plantIds: string[];
  allPlants: boolean;
};

const technical = ["users.manage", "roles.manage", "settings.manage", "audit.read"];
const businessRead = ["dashboard.read", "reports.read", "reports.export", "approvals.read", "period.read", "audit.read"];
const masterRead = ["master.material.read", "master.location.read"];
const pc = [
  "master.material.create", "master.material.update", "master.material.deactivate",
  "master.location.create", "master.location.update", "master.location.deactivate",
  "inventory.read", "inventory.adjust", "inventory.migrate", "inventory.period.request", "production.read", "production.create",
  "production.verify", "production.post", "production.config.create",
  "fuel.read", "fuel.create", "fuel.verify", "fuel.post", "fuel.config.create",
  "sales.read", "sales.manage", "delivery.manage", "weighbridge.read", "weighbridge.create",
  "sales.verify", "sales.config.create", "delivery.verify",
  "documents.read", "documents.create", "documents.issue", "documents.cancel.request", "documents.config.read", "documents.config.create",
  "asset.read", "asset.physical.read", "asset.physical.create", "workers.read", "workers.create", "inspection.read", "inspection.config.read",
];
const finance = ["finance.read", "finance.manage", "finance.config.create", "finance.config.attest", "finance.pph.verify", "inventory.read", "inventory.migration.verify", "inventory.period.reconcile", "sales.read", "sales.policy.attest"];
const manager = ["master.material.verify", "master.location.verify", "inventory.approve", "inventory.period.approve", "production.approve", "production.config.verify", "fuel.config.verify", "fuel.read", "sales.approve", "sales.config.verify", "finance.config.verify", "finance.correction.approve"];

export function allowedActions(role: string, functions: readonly string[] = []): string[] {
  if (role === "SUPERADMIN") return technical;
  const stageRead = ["documents.read", "documents.config.read", "asset.read", "asset.physical.read", "asset.finance.read", "workers.read", "inspection.read", "inspection.export", "inspection.config.read"];
  const stageFinance = ["asset.read", "asset.physical.read", "asset.finance.read", "asset.finance.create", "asset.finance.attest", "asset.depreciation.generate", "asset.depreciation.verify", "asset.depreciation.post", "asset.depreciation.correct", "documents.read", "documents.config.read", "documents.create", "documents.issue", "documents.cancel.request"];
  if (role === "DIREKTUR") return [...businessRead, ...masterRead, ...stageRead, "sales.read", "finance.read", "inventory.read", "production.read", "fuel.read"];
  if (role === "MANAGER") return [...businessRead, ...masterRead, ...manager, ...stageRead, "documents.config.verify", "documents.approve", "documents.cancel.approve", "asset.physical.verify", "asset.finance.verify", "asset.depreciation.correction.approve", "workers.verify", "sales.read", "finance.read", "inventory.read", "production.read"];
  if (role === "HSE") return ["master.location.read", "dashboard.read", "workers.read", "workers.create", "inspection.read", "inspection.create", "inspection.verify", "inspection.config.read", "inspection.config.create", "inspection.config.verify", "inspection.followup", "inspection.export", "health.read", "health.manage", "health.verify"];
  if (role !== "ADMIN") return [];
  return [...new Set([...businessRead, ...masterRead, ...(functions.includes("PC") ? pc : []), ...(functions.includes("FINANCE") ? [...finance, ...stageFinance] : [])])];
}

export function can(actor: AccessActor, permission: string, plantId?: string): boolean {
  // Role ceilings apply even to legacy wildcard claims and explicit grants.
  if (actor.roles.includes("SUPERADMIN") && !technical.includes(permission)) return false;
  if (!actor.permissions.includes(permission)) return false;
  if (!actor.roles.some(role => allowedActions(role, actor.functions).includes(permission))) return false;
  return !plantId || actor.allPlants || actor.plantIds.includes(plantId);
}

export function canApprove(actor: AccessActor, permission: string, makerId: string, plantId?: string) {
  return actor.userId !== makerId && can(actor, permission, plantId);
}

// Legacy modules cannot filter by a plant yet. Only explicit company-wide scope
// may access these queries; a plant-scoped grant must never read all plants.
export function requiresCompanyScope(permission: string) {
  return !permission.startsWith("master.") && !technical.includes(permission);
}

export function plantFilter(actor: AccessActor) {
  return actor.allPlants ? {} : { id: { in: actor.plantIds } };
}

export const NAV_PERMISSIONS: Record<string, string> = {
  "/": "dashboard.read", "/users": "users.manage", "/settings": "settings.manage",
  "/materials": "master.material.read", "/locations": "master.location.read",
  "/production": "production.read", "/weighbridge": "weighbridge.read", "/stockpile": "inventory.read",
  "/blending": "production.read", "/fuel": "fuel.read",
  "/inventory": "inventory.read", "/deliveries": "sales.read", "/customers": "sales.read",
  "/stock-opnames": "inventory.read", "/internal-issues": "inventory.read",
  "/quotations": "sales.read", "/sales-orders": "sales.read", "/invoices": "finance.read",
  "/customer-pos": "sales.read",
  "/documents": "documents.read", "/assets": "asset.read", "/inspections": "inspection.read",
  "/payments": "finance.read", "/receivables": "finance.read",
  "/approvals": "approvals.read",
  "/suppliers": "procurement.manage", "/purchase-requests": "procurement.manage", "/purchase-orders": "procurement.manage",
  "/equipment": "maintenance.manage", "/maintenance": "maintenance.manage", "/spare-parts": "maintenance.manage",
  "/vehicles": "delivery.manage", "/reports": "reports.read", "/audit": "audit.read", "/notifications": "dashboard.read",
};
