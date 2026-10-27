import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmailSender } from "@/lib/email/sender";
import { getEnv } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp/cloud-api";

describe("development delivery adapters", () => {
  it("records email without claiming the message was sent", async () => {
    const sender = createEmailSender();
    expect(sender.mode).toBe("mock");
    const result = await sender.send({
      to: "ahmed@example.com",
      customerName: "Ahmed Khan",
      accessUrl: "http://localhost:3000/d/example-token",
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      idempotencyKey: "unit-email-mock",
    });
    expect(result.mock).toBe(true);
    expect(result.providerMessageId).toBeNull();
    const file = path.join(getEnv().DEV_MAILBOX_PATH, "unit-email-mock.json");
    const recorded = JSON.parse(await readFile(file, "utf8")) as { channel: string };
    expect(recorded.channel).toBe("EMAIL");
    await rm(file, { force: true });
  });

  it("records WhatsApp as mock delivery when credentials are absent", async () => {
    const result = await sendWhatsApp({
      to: "+923001234567",
      customerName: "Ahmed Khan",
      accessUrl: "http://localhost:3000/d/example-token",
      idempotencyKey: "unit-whatsapp-mock",
    });
    expect(result.mock).toBe(true);
    expect(result.providerMessageId).toBeNull();
    const file = path.join(getEnv().DEV_MAILBOX_PATH, "unit-whatsapp-mock.json");
    const recorded = JSON.parse(await readFile(file, "utf8")) as { mode: string };
    expect(recorded.mode).toBe("mock");
    await rm(file, { force: true });
  });
});
