// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCountdown } from "@/components/public-portal/session-countdown";

describe("SessionCountdown", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  });

  afterEach(() => {
    vi.useRealTimers();
    reload.mockReset();
  });

  it("counts down from five minutes and reloads when the session ends", () => {
    render(<SessionCountdown expiresAt="2026-11-23T10:05:00Z" />);
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");

    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole("timer")).toHaveTextContent("3:59");
    expect(reload).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(240_000));
    expect(reload).toHaveBeenCalled();
  });
});
