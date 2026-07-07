import type { Major } from "../lib/planner/types";

// Curated from majors/*.pdf (UWaterloo academic calendar, BMath Honours).
// W-courses (co-op professional-development milestones like BUS127W) that
// appear as calendar alternatives are omitted — they aren't scheduled academic
// courses. Codes use the canonical spaced form ("AMATH 250").

const mathFinance: Major = {
  id: "math-finance",
  name: "Mathematical Finance",
  minOverallAvg: 60,
  minMajorAvg: 70,
  minMathUnits: 13,
  minNonMathUnits: 5,
  crossListNote: true,
  requirement: {
    kind: "all",
    of: [
      {
        kind: "all",
        label: "Core",
        of: [
          { kind: "course", code: "ACTSC 231" },
          { kind: "course", code: "ACTSC 372" },
          { kind: "course", code: "ACTSC 445" },
          { kind: "course", code: "ACTSC 446" },
          { kind: "course", code: "PMATH 351" },
          { kind: "course", code: "PMATH 450" },
          { kind: "course", code: "STAT 330" },
          { kind: "course", code: "STAT 331" },
          { kind: "course", code: "STAT 333" },
          { kind: "course", code: "STAT 443" },
          { kind: "course", code: "AFM 101" },
          { kind: "course", code: "AFM 102" },
          { kind: "course", code: "ECON 101" },
          { kind: "course", code: "ECON 102" },
          { kind: "course", code: "ECON 201" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Intro to Business",
        of: [
          { kind: "course", code: "AFM 131" },
          { kind: "course", code: "ARBUS 101" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Computational math",
        of: [
          { kind: "course", code: "AMATH 242" },
          { kind: "course", code: "CS 335" },
          { kind: "course", code: "CS 371" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Differential equations",
        of: [
          { kind: "course", code: "AMATH 250" },
          { kind: "course", code: "AMATH 251" },
          { kind: "course", code: "AMATH 350" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Analysis / optimization",
        of: [
          { kind: "course", code: "AMATH 351" },
          { kind: "course", code: "CO 250" },
          { kind: "course", code: "CO 255" },
          { kind: "course", code: "PMATH 352" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Financial computation / PDEs",
        of: [
          { kind: "course", code: "ACTSC 447" },
          { kind: "course", code: "AMATH 353" },
          { kind: "course", code: "CO 372" },
          { kind: "course", code: "CS 476" },
          { kind: "course", code: "PMATH 453" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Calculus 3 stream",
        of: [
          { kind: "course", code: "MATH 247" },
          { kind: "all", of: [{ kind: "course", code: "MATH 237" }, { kind: "course", code: "PMATH 333" }] },
        ],
      },
    ],
  },
  notes: [
    "Only one course from any cross-listed set may count.",
    "Some double-degree substitutions (e.g. BUS393W for ACTSC 372) are not modelled.",
  ],
};

const appliedMathSciComp: Major = {
  id: "applied-math-scicomp",
  name: "Applied Mathematics (Scientific Computing & ML)",
  minOverallAvg: 60,
  minMajorAvg: 65,
  minMathUnits: 13,
  minNonMathUnits: 5,
  crossListNote: true,
  requirement: {
    kind: "all",
    of: [
      {
        kind: "all",
        label: "Core",
        of: [
          { kind: "course", code: "AMATH 231" },
          { kind: "course", code: "AMATH 445" },
          { kind: "course", code: "CS 234" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Computational math",
        of: [
          { kind: "course", code: "AMATH 242" },
          { kind: "course", code: "CS 371" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Differential equations",
        of: [
          { kind: "course", code: "AMATH 250" },
          { kind: "course", code: "AMATH 251" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Computational methods / ML",
        of: [
          { kind: "course", code: "AMATH 342" },
          { kind: "course", code: "AMATH 345" },
          { kind: "course", code: "AMATH 449" },
          { kind: "course", code: "CS 479" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Optimization",
        of: [
          { kind: "course", code: "CO 250" },
          { kind: "course", code: "CO 255" },
        ],
      },
      {
        kind: "chooseN",
        n: 1,
        label: "Calculus 3",
        of: [
          { kind: "course", code: "MATH 237" },
          { kind: "course", code: "MATH 247" },
        ],
      },
      {
        kind: "pattern",
        n: 2,
        label: "2 more AMATH at the 300/400 level",
        subjects: ["AMATH"],
        minLevel: 300,
        maxLevel: 499,
      },
      {
        kind: "pattern",
        n: 1,
        label: "1 more AMATH at the 400 level",
        subjects: ["AMATH"],
        minLevel: 400,
        maxLevel: 499,
      },
      {
        kind: "pattern",
        n: 4,
        label: "4 more from List 1",
        subjects: [],
        excludeCoreReqs: true,
        pool: [
          "AMATH 342", "AMATH 345", "AMATH 391", "AMATH 442", "AMATH 446", "AMATH 449", "AMATH 477",
          "CO 367", "CO 466", "CO 481",
          "CS 231", "CS 467", "CS 475", "CS 479",
          "PHYS 467", "PMATH 343",
          "STAT 331", "STAT 341", "STAT 441", "STAT 444",
        ],
      },
    ],
  },
  notes: [
    "Courses used for core requirements can't also satisfy List 1 (not yet enforced).",
    "Only one course from any cross-listed set may count.",
  ],
};

export const MAJORS: Major[] = [mathFinance, appliedMathSciComp];

export function majorById(id: string): Major | undefined {
  return MAJORS.find((m) => m.id === id);
}
