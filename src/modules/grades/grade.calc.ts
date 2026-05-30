/**
 * Pure grading utilities. Converts a raw score/max into a percentage and a
 * letter grade using a standard scale. Fully unit testable (no I/O).
 */

export interface GradeBand {
  min: number; // inclusive percentage lower bound
  letter: string;
  remark: string;
}

export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { min: 80, letter: 'A', remark: 'Excellent' },
  { min: 70, letter: 'B', remark: 'Very Good' },
  { min: 60, letter: 'C', remark: 'Good' },
  { min: 50, letter: 'D', remark: 'Satisfactory' },
  { min: 40, letter: 'E', remark: 'Pass' },
  { min: 0, letter: 'F', remark: 'Fail' },
];

export function percentage(score: number, maxScore: number): number {
  if (maxScore <= 0) throw new Error('maxScore must be greater than zero');
  if (score < 0) throw new Error('score cannot be negative');
  if (score > maxScore) throw new Error('score cannot exceed maxScore');
  return Math.round((score / maxScore) * 10000) / 100;
}

export function letterFor(pct: number, scale: GradeBand[] = DEFAULT_GRADE_SCALE): GradeBand {
  const band = scale.find((b) => pct >= b.min);
  if (!band) throw new Error('No matching grade band');
  return band;
}

export function computeGrade(
  score: number,
  maxScore: number,
  scale: GradeBand[] = DEFAULT_GRADE_SCALE,
): { percentage: number; letter: string; remark: string } {
  const pct = percentage(score, maxScore);
  const band = letterFor(pct, scale);
  return { percentage: pct, letter: band.letter, remark: band.remark };
}

/** Grade Point Average on a 4.0 scale from a set of percentages. */
export function gpa(percentages: number[]): number {
  if (percentages.length === 0) return 0;
  const points = percentages.map((p) => {
    if (p >= 80) return 4;
    if (p >= 70) return 3;
    if (p >= 60) return 2;
    if (p >= 50) return 1;
    return 0;
  });
  const total = points.reduce<number>((a, b) => a + b, 0);
  return Math.round((total / percentages.length) * 100) / 100;
}
