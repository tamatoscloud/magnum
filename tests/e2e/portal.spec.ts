import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe("dividend portal", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the browser flow.");

  test("admin signs in and a wrong folio is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail ?? "");
    await page.getByLabel("Password").fill(adminPassword ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/d/" + "a".repeat(43));
    await expect(page.getByRole("heading", { name: "Access Your Dividend Statement" })).toBeVisible();
    await expect(page.getByText("This link is no longer available.")).toBeVisible();
  });
});

export async function syntheticStatement(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Synthetic test statement", { x: 48, y: 720, size: 18, font });
  return Buffer.from(await doc.save());
}

export async function syntheticArchive(filename: string, pdf: Buffer): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(filename, pdf);
  return zip.generateAsync({ type: "nodebuffer" });
}
