import type { CatalogCourse } from "../lib/planner/types";

// Curated course catalog for the two Math majors we plan. Covers every course
// the major requirement trees reference (plus first-year prerequisites and the
// Applied-Math List-1 pool). Cross-listed courses are one entry with the
// equivalent codes in `crosslist`.
//
// Prerequisites are added in a follow-up pass (needed by the scheduler, not by
// progress tracking); `faculty`/`units`/`crosslist` are what progress uses now.

const c = (
  code: string,
  title: string,
  faculty: "math" | "other",
  crosslist?: string[],
): CatalogCourse => ({ code, title, units: 0.5, faculty, ...(crosslist ? { crosslist } : {}) });

export const COURSES: CatalogCourse[] = [
  // First-year math foundation (prereq roots)
  c("MATH 135", "Algebra for Honours Mathematics", "math"),
  c("MATH 136", "Linear Algebra 1 for Honours Mathematics", "math"),
  c("MATH 137", "Calculus 1 for Honours Mathematics", "math"),
  c("MATH 138", "Calculus 2 for Honours Mathematics", "math"),
  c("MATH 237", "Calculus 3 for Honours Mathematics", "math"),
  c("MATH 247", "Calculus 3 (Advanced Level)", "math"),
  c("CS 135", "Designing Functional Programs", "math"),
  c("CS 136", "Elementary Algorithm Design and Data Abstraction", "math"),
  c("STAT 230", "Probability", "math"),
  c("STAT 231", "Statistics", "math"),

  // ACTSC
  c("ACTSC 231", "Introductory Financial Mathematics", "math"),
  c("ACTSC 372", "Investment Science and Corporate Finance", "math"),
  c("ACTSC 445", "Quantitative Enterprise Risk Management", "math"),
  c("ACTSC 446", "Mathematics of Financial Markets", "math"),
  c("ACTSC 447", "Numerical Computation for Financial Modelling", "math", ["CS 476"]),

  // AMATH
  c("AMATH 231", "Calculus 4", "math"),
  c("AMATH 242", "Introduction to Computational Mathematics", "math", ["CS 371"]),
  c("AMATH 250", "Introduction to Differential Equations", "math"),
  c("AMATH 251", "Introduction to Differential Equations (Advanced Level)", "math"),
  c("AMATH 342", "Computational Methods for Differential Equations", "math"),
  c("AMATH 345", "Data-Driven Mathematical Models", "math"),
  c("AMATH 350", "Differential Equations for Business and Economics", "math"),
  c("AMATH 351", "Ordinary Differential Equations", "math"),
  c("AMATH 353", "Partial Differential Equations 1", "math"),
  c("AMATH 391", "Data Analysis with Fourier and Wavelet Methods", "math"),
  c("AMATH 442", "Computational Methods for Partial Differential Equations", "math"),
  c("AMATH 445", "Scientific Machine Learning", "math"),
  c("AMATH 446", "Introduction to Mathematics of Deep Learning", "math"),
  c("AMATH 449", "Neural Networks", "math", ["CS 479"]),
  c("AMATH 477", "Stochastic Processes for Applied Mathematics", "math"),

  // PMATH
  c("PMATH 333", "Introduction to Real Analysis", "math"),
  c("PMATH 343", "Introduction to the Mathematics of Quantum Information", "math"),
  c("PMATH 351", "Real Analysis", "math"),
  c("PMATH 352", "Complex Analysis", "math"),
  c("PMATH 450", "Measure Theory", "math"),
  c("PMATH 453", "Functional Analysis", "math"),

  // STAT
  c("STAT 330", "Mathematical Statistics", "math"),
  c("STAT 331", "Applied Linear Models", "math"),
  c("STAT 333", "Stochastic Processes 1", "math"),
  c("STAT 341", "Computational Statistics and Data Analysis", "math"),
  c("STAT 441", "Statistical Learning - Classification", "math"),
  c("STAT 443", "Forecasting", "math"),
  c("STAT 444", "Statistical Learning - Advanced Regression", "math"),

  // CS (math faculty)
  c("CS 231", "Algorithmic Problem Solving", "math"),
  c("CS 234", "Data Types and Structures", "math"),
  c("CS 335", "Computational Methods in Business and Finance", "math"),
  c("CS 475", "Computational Linear Algebra", "math"),

  // CO
  c("CO 250", "Introduction to Optimization", "math"),
  c("CO 255", "Introduction to Optimization (Advanced Level)", "math"),
  c("CO 367", "Nonlinear Optimization", "math"),
  c("CO 372", "Portfolio Optimization Models", "math"),
  c("CO 466", "Continuous Optimization", "math"),
  c("CO 481", "Introduction to Quantum Information Processing", "math", ["CS 467", "PHYS 467"]),

  // Non-math
  c("ECON 101", "Introduction to Microeconomics", "other"),
  c("ECON 102", "Introduction to Macroeconomics", "other"),
  c("ECON 201", "Microeconomic Theory for Business and Policy", "other"),
  c("AFM 101", "Introduction to Financial Accounting", "other"),
  c("AFM 102", "Introduction to Managerial Accounting", "other"),
  c("AFM 131", "Introduction to Business in North America", "other", ["ARBUS 101"]),
];
