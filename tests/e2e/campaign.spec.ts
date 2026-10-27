import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe("annual report campaign", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the campaign browser flow.");

  test("admin activates a shared campaign and two customers download different passwords", async ({ page, browser }) => {
    const directory = await mkdtemp(path.join(tmpdir(), "magnum-e2e-"));
    const pdfPath = path.join(directory, "annual.pdf");
    const csvPath = path.join(directory, "customers.csv");
    const document = await PDFDocument.create();
    const pdfPage = document.addPage();
    const font = await document.embedFont(StandardFonts.Helvetica);
    pdfPage.drawText("Synthetic annual report", { x: 48, y: 720, size: 18, font });
    await writeFile(pdfPath, await document.save());
    await writeFile(csvPath, "customer_name,folio_number,email,phone_number\nAhmed Khan,MAG001245,ahmed@example.com,\nBilal Hussain,001245,,\n");

    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail ?? "");
    await page.getByLabel("Password").fill(adminPassword ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/admin/campaigns/new");
    await page.getByLabel("Campaign name").fill(`E2E annual ${Date.now()}`);
    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect(page.getByRole("heading", { name: /E2E annual/ })).toBeVisible();
    await page.locator("input[name=source]").setInputFiles(pdfPath);
    await page.getByRole("button", { name: "Upload PDF" }).click();
    await expect(page.getByText("Stored")).toBeVisible();
    await page.locator("input[name=csv]").setInputFiles(csvPath);
    await page.getByRole("button", { name: "Upload CSV" }).click();
    await page.getByRole("button", { name: "Validate roster" }).click();
    await page.getByRole("button", { name: "Activate campaign" }).click();
    await page.getByRole("button", { name: "Show shared URL" }).click();
    const shared = page.getByText(/\/campaign\//);
    await expect(shared).toBeVisible();
    const url = await shared.innerText();

    async function downloadFor(name: string, folio: string) {
      const context = await browser.newContext();
      const customer = await context.newPage();
      await customer.goto(url);
      await customer.getByLabel("Full name").fill(name);
      await customer.getByLabel("Folio number").fill(folio);
      await customer.getByRole("button", { name: "Verify" }).click();
      const downloadPromise = customer.waitForEvent("download");
      await customer.getByRole("link", { name: "Download annual report" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("annual-report.pdf");
      await context.close();
    }

    await downloadFor("Ahmed Khan", "MAG001245");
    await downloadFor("Bilal Hussain", "001245");

    const rejected = await browser.newPage();
    await rejected.goto(url);
    await rejected.getByLabel("Full name").fill("Ahmed Khan");
    await rejected.getByLabel("Folio number").fill("MAG009999");
    await rejected.getByRole("button", { name: "Verify" }).click();
    await expect(rejected.getByText("We could not verify those details.")).toBeVisible();

    await page.getByRole("button", { name: "Revoke campaign" }).click();
    await expect(page.getByRole("button", { name: "Revoke campaign" })).toBeHidden();
    await rejected.goto(url);
    await expect(rejected.getByText("This link is no longer available.")).toBeVisible();
  });
});
