import type { Role } from "./domain";

// Permissions are checked on the server in every action and page. Hiding a link is never the only control.
export const PERMISSIONS = [
  "patients:read",
  "patients:write",
  "visits:write",
  "followups:manage",
  "finance:read",
  "finance:write",
  "dashboard:view",
  "staff:manage",
  "inventory:read",
  "inventory:write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  doctor: ["patients:read", "patients:write", "visits:write", "followups:manage", "inventory:read"],
  front_desk: ["patients:read", "patients:write", "visits:write", "followups:manage", "finance:read", "finance:write", "inventory:read", "inventory:write"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
