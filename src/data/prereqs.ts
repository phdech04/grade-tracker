import type { PrereqExpr } from "../lib/planner/types";

// Prerequisite / antirequisite / terms-offered data, curated from the
// courses/*.pdf calendar descriptions. Keyed by the catalog's canonical code
// (cross-listed courses use whichever code the calendar documented). Prereq
// expressions enumerate cross-listed alternatives inline (e.g. AMATH 242 / CS
// 371), so evaluation needs no separate cross-list resolution. Min-grade and
// level/plan conditions are intentionally dropped.
//
// A few newer courses (AMATH 345/445/446) had no prereq line the extractor
// could find — left undefined (schedulable anywhere) until confirmed.

interface PrereqData {
  prereq?: PrereqExpr;
  antireq?: string[];
  termsOffered?: ("F" | "W" | "S")[];
}

const oneOf = (...cs: string[]): PrereqExpr => ({ oneOf: cs.map((course) => ({ course })) });

export const PREREQS: Record<string, PrereqData> = {
  // --- MATH (foundation) ---
  "MATH 135": { antireq: ["MATH 145"], termsOffered: ["F", "W", "S"] },
  "MATH 136": { prereq: oneOf("MATH 135", "MATH 145"), termsOffered: ["F", "W", "S"] },
  "MATH 137": { termsOffered: ["F", "W", "S"] },
  "MATH 138": { prereq: oneOf("MATH 116", "MATH 117", "MATH 127", "MATH 137", "MATH 147"), termsOffered: ["F", "W", "S"] },
  "MATH 237": {
    prereq: { all: [oneOf("MATH 106", "MATH 114", "MATH 115", "MATH 136", "MATH 146"), oneOf("MATH 128", "MATH 138", "MATH 148")] },
    antireq: ["MATH 247"],
    termsOffered: ["F", "W", "S"],
  },
  "MATH 247": { prereq: { all: [{ course: "MATH 146" }, { course: "MATH 148" }] }, antireq: ["MATH 237"], termsOffered: ["F", "W", "S"] },

  // --- CS (math faculty) ---
  "CS 135": {},
  "CS 136": { prereq: oneOf("CS 115", "CS 116", "CS 135", "CS 145"), termsOffered: ["F", "W", "S"] },
  "CS 231": { prereq: oneOf("CS 116", "CS 136", "CS 138", "CS 146") },
  "CS 234": { prereq: oneOf("CS 116", "CS 136", "CS 138", "CS 146") },
  "CS 335": {
    prereq: { all: [oneOf("CS 116", "CS 136", "CS 138", "CS 146"), oneOf("MATH 136", "MATH 146"), oneOf("MATH 237", "MATH 247"), oneOf("STAT 231", "STAT 241")] },
    antireq: ["CS 371", "CS 370", "AMATH 242"],
  },
  "CS 475": { prereq: oneOf("CS 371", "CS 370", "AMATH 242") },

  // --- AMATH ---
  "AMATH 231": { prereq: oneOf("MATH 237", "MATH 247"), termsOffered: ["F", "W", "S"] },
  // AMATH 242 == CS 371 (cross-listed)
  "AMATH 242": {
    prereq: { all: [oneOf("CS 116", "CS 136", "CS 138", "CS 146"), oneOf("MATH 235", "MATH 245"), oneOf("MATH 237", "MATH 247")] },
    antireq: ["CS 335", "CS 370"],
    termsOffered: ["W", "S"],
  },
  "AMATH 250": {
    prereq: { all: [oneOf("MATH 106", "MATH 114", "MATH 115", "MATH 136", "MATH 146"), oneOf("MATH 118", "MATH 119", "MATH 128", "MATH 138", "MATH 148")] },
    antireq: ["AMATH 251", "AMATH 350"],
    termsOffered: ["F", "W", "S"],
  },
  "AMATH 251": {
    prereq: { all: [oneOf("MATH 106", "MATH 114", "MATH 115", "MATH 136", "MATH 146"), oneOf("MATH 118", "MATH 119", "MATH 128", "MATH 138", "MATH 148")] },
    antireq: ["AMATH 250", "AMATH 350"],
    termsOffered: ["F"],
  },
  "AMATH 342": { prereq: { all: [oneOf("AMATH 242", "CS 371", "CS 370"), oneOf("AMATH 250", "AMATH 251", "AMATH 350")] }, termsOffered: ["F", "W"] },
  "AMATH 345": {},
  "AMATH 350": {
    prereq: { all: [oneOf("MATH 106", "MATH 136", "MATH 146"), oneOf("MATH 237", "MATH 247"), oneOf("STAT 230", "STAT 240")] },
    antireq: ["AMATH 250", "AMATH 251", "AMATH 351", "AMATH 353"],
    termsOffered: ["F", "W"],
  },
  "AMATH 351": { prereq: { all: [oneOf("AMATH 250", "AMATH 251"), oneOf("MATH 237", "MATH 247")] }, antireq: ["AMATH 350"], termsOffered: ["F", "S"] },
  "AMATH 353": { prereq: { all: [{ course: "AMATH 231" }, oneOf("AMATH 250", "AMATH 251")] }, antireq: ["AMATH 350"], termsOffered: ["W", "S"] },
  "AMATH 391": { prereq: { all: [oneOf("AMATH 231", "PHYS 364", "SYDE 252"), oneOf("MATH 114", "MATH 115", "MATH 136", "MATH 146")] }, termsOffered: ["F"] },
  "AMATH 442": { prereq: { course: "AMATH 342" }, termsOffered: ["F"] },
  "AMATH 445": {},
  "AMATH 446": {},
  // AMATH 449 == CS 479 (cross-listed)
  "AMATH 449": { prereq: { all: [oneOf("CS 335", "CS 370", "CS 371", "AMATH 242"), oneOf("STAT 230", "STAT 240")] } },
  "AMATH 477": { prereq: { all: [oneOf("AMATH 250", "AMATH 251", "AMATH 350"), oneOf("STAT 230", "STAT 240")] }, termsOffered: ["F"] },

  // --- PMATH ---
  "PMATH 333": { prereq: oneOf("MATH 128", "MATH 138", "MATH 148"), antireq: ["MATH 247"] },
  "PMATH 343": { prereq: { all: [oneOf("MATH 235", "MATH 245"), oneOf("MATH 247", "PMATH 333")] } },
  "PMATH 351": { prereq: oneOf("MATH 247", "PMATH 333") },
  "PMATH 352": { prereq: oneOf("MATH 247", "PMATH 333") },
  "PMATH 450": { prereq: { course: "PMATH 351" } },
  "PMATH 453": { prereq: { course: "PMATH 450" } },

  // --- CO ---
  "CO 250": { prereq: oneOf("MATH 106", "MATH 114", "MATH 115", "MATH 136", "MATH 146"), antireq: ["CO 255"], termsOffered: ["F", "W", "S"] },
  "CO 255": { prereq: { all: [oneOf("MATH 235", "MATH 245"), oneOf("MATH 237", "MATH 247")] }, antireq: ["CO 250"], termsOffered: ["W"] },
  "CO 367": { prereq: { all: [oneOf("CO 250", "CO 255"), oneOf("MATH 128", "MATH 138", "MATH 148")] }, termsOffered: ["F"] },
  "CO 372": { prereq: { all: [oneOf("ACTSC 372", "ACTSC 291", "ACTSC 371"), oneOf("CO 250", "CO 255")] }, termsOffered: ["F", "W"] },
  "CO 466": { prereq: oneOf("CO 367", "CO 255") },
  // CO 481 == CS 467 == PHYS 467
  "CO 481": { prereq: oneOf("MATH 114", "MATH 115", "MATH 235", "MATH 245"), termsOffered: ["F", "W"] },

  // --- STAT ---
  "STAT 230": { prereq: oneOf("MATH 137", "MATH 147", "MATH 138", "MATH 148"), antireq: ["STAT 220", "STAT 240"], termsOffered: ["F", "W", "S"] },
  "STAT 231": { prereq: { all: [oneOf("MATH 138", "MATH 148"), oneOf("STAT 220", "STAT 230", "STAT 240")] }, antireq: ["STAT 241"], termsOffered: ["F", "W", "S"] },
  "STAT 330": { prereq: { all: [oneOf("MATH 237", "MATH 247"), oneOf("STAT 230", "STAT 240"), oneOf("STAT 231", "STAT 241")] }, termsOffered: ["F", "W", "S"] },
  "STAT 331": { prereq: { all: [oneOf("MATH 235", "MATH 245"), oneOf("STAT 231", "STAT 241")] }, termsOffered: ["F", "W", "S"] },
  "STAT 333": { prereq: { all: [oneOf("STAT 230", "STAT 240"), oneOf("MATH 237", "MATH 247")] }, termsOffered: ["F", "W", "S"] },
  "STAT 341": { prereq: { all: [oneOf("MATH 237", "MATH 247"), oneOf("STAT 230", "STAT 240"), oneOf("STAT 231", "STAT 241")] }, termsOffered: ["F", "W"] },
  "STAT 441": { prereq: { all: [{ course: "STAT 341" }, oneOf("STAT 331", "STAT 371")] }, termsOffered: ["F", "W"] },
  "STAT 443": { prereq: oneOf("STAT 331", "STAT 371"), termsOffered: ["F", "W", "S"] },
  "STAT 444": { prereq: { all: [{ course: "STAT 341" }, oneOf("STAT 331", "STAT 371")] }, termsOffered: ["W", "S"] },

  // --- ACTSC ---
  "ACTSC 231": { prereq: oneOf("MATH 137", "MATH 147"), termsOffered: ["F", "W", "S"] },
  "ACTSC 372": { prereq: { all: [{ course: "ACTSC 231" }, oneOf("MATH 235", "MATH 245"), oneOf("MATH 237", "MATH 247")] }, termsOffered: ["F", "W", "S"] },
  "ACTSC 445": { prereq: { all: [oneOf("ACTSC 372", "ACTSC 391"), oneOf("STAT 330", "STAT 334")] }, termsOffered: ["F", "S"] },
  "ACTSC 446": { prereq: { all: [oneOf("ACTSC 372", "ACTSC 391"), oneOf("STAT 333", "STAT 334")] }, termsOffered: ["F", "W"] },
  // ACTSC 447 == CS 476
  "ACTSC 447": { prereq: { all: [oneOf("CS 371", "CS 370", "AMATH 242"), oneOf("STAT 231", "STAT 241")] } },

  // --- ECON / AFM (non-math) ---
  "ECON 101": { antireq: ["ECON 100"] },
  "ECON 102": {},
  "ECON 201": { prereq: oneOf("ECON 101", "ECON 100") },
  "AFM 101": {},
  "AFM 102": { prereq: oneOf("AFM 101", "AFM 191") },
  "AFM 131": { antireq: ["AFM 132"] },
};
