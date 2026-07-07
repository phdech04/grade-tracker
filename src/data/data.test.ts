import { describe, expect, it } from "vitest";
import { MAJORS } from "./majors";
import { COURSES } from "./courses";
import { buildCatalog } from "../lib/planner/requirements";
import { normalizeCode } from "../lib/planner/codes";
import type { ReqGroup } from "../lib/planner/types";

const catalog = buildCatalog(COURSES);

function referencedCodes(node: ReqGroup): string[] {
  switch (node.kind) {
    case "course":
      return [node.code];
    case "all":
    case "chooseN":
      return node.of.flatMap(referencedCodes);
    case "pattern":
      return node.pool ?? [];
  }
}

describe("catalog integrity", () => {
  it("resolves every course code referenced by every major", () => {
    const missing: string[] = [];
    for (const major of MAJORS) {
      for (const code of referencedCodes(major.requirement)) {
        if (!catalog.has(normalizeCode(code))) missing.push(`${major.id}: ${code}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no duplicate canonical codes", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const c of COURSES) {
      const n = normalizeCode(c.code);
      if (seen.has(n)) dupes.push(n);
      seen.add(n);
    }
    expect(dupes).toEqual([]);
  });
});
