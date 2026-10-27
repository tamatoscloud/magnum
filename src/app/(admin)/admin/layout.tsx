import { redirect } from "next/navigation";
import { AdminShell, type NavLink } from "@/components/layout/admin-shell";
import { can, type Permission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";

const NAV: Array<NavLink & { permission: Permission }> = [
  { href: "/admin", label: "Dashboard", permission: "dashboard:read" },
  { href: "/admin/batches", label: "Batches", permission: "batches:read" },
  { href: "/admin/campaigns", label: "Campaigns", permission: "campaigns:read" },
  { href: "/admin/customers", label: "Customers", permission: "customers:read" },
  { href: "/admin/documents", label: "Documents", permission: "documents:read" },
  { href: "/admin/audit-logs", label: "Audit logs", permission: "audit:read" },
  { href: "/admin/settings", label: "Settings", permission: "settings:read" },
  { href: "/admin/users", label: "Users", permission: "users:manage" },
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const links = NAV.filter((item) => can(user.role, item.permission)).map(({ href, label }) => ({ href, label }));
  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }} links={links}>
      {children}
    </AdminShell>
  );
}
