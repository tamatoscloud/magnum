import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { listUsers } from "@/server/repositories/admin-queries";
import { createAdminUser } from "@/server/services/account-service";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR"]),
});

export async function GET(): Promise<Response> {
  try {
    await requirePermission("users:manage");
    return json({ users: await listUsers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission("users:manage");
    const body = schema.parse(await readJson(request));
    await createAdminUser({ ...body, actorId: actor.id });
    return json({ ok: true }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Check the name, email, and role." }, 400);
    return toErrorResponse(error);
  }
}
