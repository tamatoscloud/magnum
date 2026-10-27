// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerifyForm } from "@/components/public-portal/verify-form";

describe("customer verification form", () => {
  it("asks for a name and folio without revealing a customer record", () => {
    render(<VerifyForm token={"a".repeat(40)} />);
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.getByLabelText("Folio number")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
    expect(screen.queryByText(/ahmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MAG001245/)).not.toBeInTheDocument();
  });
});
