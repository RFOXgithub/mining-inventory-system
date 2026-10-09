export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@quarryflow.co.id",
  password: "QuarryFlow2026!",
  name: "Admin StoneCrusher",
  roles: ["SUPERADMIN"],
  permissions: ["users.manage", "roles.manage", "settings.manage", "audit.read"],
} as const;

export const DEVELOPMENT_AUTH_SECRET =
  "quarryflow-demo-secret-change-before-production";
