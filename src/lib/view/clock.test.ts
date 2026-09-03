import { describe, expect, it } from "vitest";
import { clockOf, momentOf } from "./clock";

/**
 * The whole point of these two is that the answer depends on where the reader
 * is, so the tests pin the *zone* and then assert the answer.
 *
 * `TZ` is read by Node when the process starts, so it cannot be set from in
 * here — `vitest.config.ts` fixes it for the suite. What these check instead is
 * the pair of things that must hold in every zone: the shape of the output, and
 * that the same instant read in two zones is two different clock faces.
 */
describe("reading a stored instant", () => {
  it("gives an hour and a minute and nothing else", () => {
    expect(clockOf("2026-09-03T09:15:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("puts midnight at 00, not at 12", () => {
    // Whatever the zone, some instant in the day lands on hour 00, and it must
    // read as 00 rather than as 12 — which is what a locale left to itself
    // would give a reader whose machine is set to English.
    const faces = Array.from({ length: 24 }, (_, h) =>
      clockOf(`2026-09-03T${String(h).padStart(2, "0")}:00:00.000Z`).slice(0, 2),
    );
    expect(faces).toContain("00");
    expect(faces).not.toContain("24");
  });

  it("reads the same instant differently in two zones", () => {
    // Not a formatting detail — it is the reason the instant is stored in UTC
    // and formatted here rather than sent down ready-made.
    const at = new Date("2026-09-03T09:15:00.000Z");
    const warsaw = new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Warsaw",
    }).format(at);
    const tokyo = new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    }).format(at);
    expect(warsaw).toBe("11:15");
    expect(tokyo).toBe("18:15");
  });

  it("names the month in Polish, with the date and the seconds", () => {
    const said = momentOf("2026-09-03T09:15:07.000Z");
    expect(said).toContain("wrze");
    expect(said).toContain("2026");
    expect(said).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  /**
   * A missing or unreadable instant reads as nothing, not as a placeholder.
   * See the note on `moment`: a dash where a time should be is the eye being
   * drawn to the one part of the row that says nothing.
   */
  it("says nothing at all when there is no instant to read", () => {
    expect(clockOf(undefined)).toBe("");
    expect(clockOf("")).toBe("");
    expect(clockOf("not a date")).toBe("");
    expect(momentOf(undefined)).toBe("");
    expect(momentOf("not a date")).toBe("");
  });
});
