import { describe, expect, it } from "vitest";
import { byDue, daysUntil, dueStatus, formatDue, parseISODate, todayISO } from "./dates";

const TODAY = "2026-10-12"; // a Monday

describe("parseISODate", () => {
  it("parses a valid ISO date at UTC midnight", () => {
    const d = parseISODate("2026-10-14");
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(9); // October = 9
    expect(d?.getUTCDate()).toBe(14);
  });

  it("rejects malformed and out-of-range dates", () => {
    expect(parseISODate("")).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
    expect(parseISODate("Oct 14")).toBeNull();
    expect(parseISODate("2026-13-01")).toBeNull(); // month overflow
    expect(parseISODate("2026-02-30")).toBeNull(); // day overflow
    expect(parseISODate("2026-1-1")).toBeNull(); // not zero-padded
  });
});

describe("daysUntil", () => {
  it("counts whole days forward and backward", () => {
    expect(daysUntil("2026-10-12", TODAY)).toBe(0);
    expect(daysUntil("2026-10-13", TODAY)).toBe(1);
    expect(daysUntil("2026-10-19", TODAY)).toBe(7);
    expect(daysUntil("2026-10-10", TODAY)).toBe(-2);
  });

  it("spans month and year boundaries", () => {
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("returns null when either date is unparseable", () => {
    expect(daysUntil("nope", TODAY)).toBeNull();
    expect(daysUntil("2026-10-14", "nope")).toBeNull();
  });
});

describe("formatDue", () => {
  it("uses relative phrasing within a week", () => {
    expect(formatDue("2026-10-12", TODAY)).toBe("Today");
    expect(formatDue("2026-10-13", TODAY)).toBe("Tomorrow");
    expect(formatDue("2026-10-11", TODAY)).toBe("Yesterday");
    expect(formatDue("2026-10-15", TODAY)).toBe("In 3 days");
    expect(formatDue("2026-10-09", TODAY)).toBe("Overdue by 3 days");
  });

  it("uses an absolute date beyond a week, with weekday for the current year", () => {
    expect(formatDue("2026-12-25", TODAY)).toBe("Fri, Dec 25");
  });

  it("includes the year for a different-year date", () => {
    expect(formatDue("2027-03-01", TODAY)).toBe("Mar 1, 2027");
  });

  it("returns empty string for an unparseable date", () => {
    expect(formatDue("someday", TODAY)).toBe("");
  });
});

describe("dueStatus", () => {
  it("buckets relative to today", () => {
    expect(dueStatus(undefined, TODAY)).toBe("none");
    expect(dueStatus("bad-date", TODAY)).toBe("none");
    expect(dueStatus("2026-10-09", TODAY)).toBe("overdue");
    expect(dueStatus("2026-10-12", TODAY)).toBe("today");
    expect(dueStatus("2026-10-16", TODAY)).toBe("soon");
    expect(dueStatus("2026-10-19", TODAY)).toBe("soon"); // exactly a week = still soon
    expect(dueStatus("2026-10-20", TODAY)).toBe("upcoming");
  });
});

describe("byDue", () => {
  it("orders earliest first and pushes undated items last", () => {
    const items = [
      { due: undefined as string | undefined },
      { due: "2026-10-20" },
      { due: "2026-10-05" },
    ];
    const sorted = [...items].sort(byDue).map((i) => i.due);
    expect(sorted).toEqual(["2026-10-05", "2026-10-20", undefined]);
  });
});

describe("todayISO", () => {
  it("produces a zero-padded ISO date string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
