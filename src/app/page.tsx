import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { getCurrentUser } from "@/lib/http";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/admin" : "/login");
}
