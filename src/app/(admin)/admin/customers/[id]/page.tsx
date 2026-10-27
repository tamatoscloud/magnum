import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CustomerActions } from "@/components/customers/customer-actions";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { getCustomerDetail } from "@/server/repositories/admin-queries";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, customer] = await Promise.all([getCurrentUser(), getCustomerDetail(id)]);
  if (!user || !customer) notFound();
  const reveal = can(user.role, "customers:read_sensitive");
  const activeLink = customer.accessLinks.find((link) => link.status === "ACTIVE") ?? null;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-brass">{customer.batch.batchName}</p>
        <h1 className="font-serif text-4xl">{customer.customerName}</h1>
      </div>
      <section className="grid gap-4 rounded-3xl border border-line bg-card p-5 md:grid-cols-2">
        <p>Folio: {reveal ? customer.folioNumber : "Hidden"}</p>
        <p>Email: {reveal ? customer.email ?? "—" : customer.email ? "On file" : "—"}</p>
        <p>Phone: {reveal ? customer.phoneNumber ?? "—" : customer.phoneNumber ? "On file" : "—"}</p>
        <p>PDF: {customer.sourcePdfFilename}</p>
        <p>Document: {customer.document ? <Badge value={customer.document.processingStatus} /> : "Not started"}</p>
        <p>Checksum: {customer.document?.encryptedSha256 ?? "—"}</p>
      </section>
      {customer.document?.failureReason ? <p className="text-sm text-danger">{customer.document.failureReason}</p> : null}
      <CustomerActions
        customerId={customer.id}
        linkId={activeLink?.id ?? customer.accessLinks[0]?.id ?? null}
        canManage={can(user.role, "links:manage")}
        canResend={can(user.role, "notifications:resend")}
      />
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Links</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {customer.accessLinks.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
              <Badge value={link.status} />
              <span>Expires {link.expiresAt.toLocaleString()}</span>
              <span>Last used {link.lastUsedAt ? link.lastUsedAt.toLocaleString() : "never"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Deliveries</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {customer.deliveries.map((delivery) => (
            <li key={delivery.id} className="flex items-center justify-between border-t border-line py-2">
              <span>{delivery.channel}</span>
              <Badge value={delivery.status} />
              <span className="text-ink-soft">{delivery.lastErrorCode ?? delivery.providerMessageId ?? ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
