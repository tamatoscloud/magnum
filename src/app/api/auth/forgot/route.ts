import { z } from "zod";
import { json, readJson, toErrorResponse } from "@/lib/http";
import { requestPasswordReset } from "@/server/services/account-service";

const schema = z.object({ email: z.string().trim().email().max(320) });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (body.success) await requestPasswordReset(body.data.email);
    return json({ ok: true, message: "If the account exists, a reset link has been sent." });
  } catch (error) {
    return toErrorResponse(error);
  }
}
