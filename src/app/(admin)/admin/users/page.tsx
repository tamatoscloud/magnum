import { Badge } from "@/components/ui/badge";
import { UserActiveToggle, UserManager } from "@/components/admin/user-manager";
import { listUsers } from "@/server/repositories/admin-queries";

export default async function UsersPage() {
  const users = await listUsers();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass">Access</p>
        <h1 className="font-serif text-4xl">Administrators</h1>
      </div>
      <UserManager />
      <div className="overflow-hidden lux-card rounded-3xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3"><Badge value={user.isActive ? "ACTIVE" : "REVOKED"} /></td>
                <td className="px-4 py-3"><UserActiveToggle id={user.id} isActive={user.isActive} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
