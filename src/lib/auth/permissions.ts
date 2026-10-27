import type { AdminRole } from "@prisma/client";

export const PERMISSIONS = {
  "dashboard:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "batches:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "batches:create": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "batches:process": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "batches:cancel": ["SUPER_ADMIN", "ADMIN"],
  "batches:retry": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "customers:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "customers:read_sensitive": ["SUPER_ADMIN", "ADMIN"],
  "links:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "links:manage": ["SUPER_ADMIN", "ADMIN"],
  "notifications:resend": ["SUPER_ADMIN", "ADMIN"],
  "documents:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "documents:retry": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "reports:export": ["SUPER_ADMIN", "ADMIN"],
  "settings:read": ["SUPER_ADMIN", "ADMIN"],
  "settings:write": ["SUPER_ADMIN"],
  "users:manage": ["SUPER_ADMIN"],
  "audit:read": ["SUPER_ADMIN", "ADMIN"],
  "queues:read": ["SUPER_ADMIN", "ADMIN"],
  "campaigns:read": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "campaigns:create": ["SUPER_ADMIN", "ADMIN", "OPERATOR"],
  "campaigns:activate": ["SUPER_ADMIN", "ADMIN"],
  "campaigns:revoke": ["SUPER_ADMIN", "ADMIN"],
  "campaigns:reveal": ["SUPER_ADMIN", "ADMIN"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AdminRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}

export function assertCan(role: AdminRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Role ${role} cannot ${permission}`);
  }
}
