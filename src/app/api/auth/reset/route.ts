import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { json, readJson, toErrorResponse } from "@/lib/http";
import { resetPassword } from "@/server/services/account-service";

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) {
      return json({ error: "Use at least 12 characters with upper-case, lower-case, and a number." }, 400);
    }
    const passwordHash = await hashPassword(body.data.password);
    await resetPassword(body.data.token, passwordHash);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
