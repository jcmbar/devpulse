export type ReworkDetection = {
  isRework: boolean;
  /** 0 = none, 1 = Retrabalho, 2 = Retrabalho 2x, 3 = Retrabalho 3x (+). */
  reworkWeight: number;
};

/**
 * Detect rework tags in category / label strings (spreadsheet + Jira labels).
 * Weight reflects the highest multiplier found on the card.
 */
export function detectRework(categories: string[]): ReworkDetection {
  const joined = categories.join(";").toLowerCase();

  const weighted = joined.match(/retrabalho\s*([2-9]|[1-9]\d+)\s*x/);
  if (weighted) {
    const n = Number(weighted[1]);
    return {
      isRework: true,
      reworkWeight: Number.isFinite(n) ? Math.min(n, 9) : 2,
    };
  }

  if (/retrabalho\s*3x|retrabalho3x/.test(joined)) {
    return { isRework: true, reworkWeight: 3 };
  }

  if (/retrabalho\s*2x|retrabalho2x/.test(joined)) {
    return { isRework: true, reworkWeight: 2 };
  }

  if (/retrabalho/.test(joined)) {
    return { isRework: true, reworkWeight: 1 };
  }

  return { isRework: false, reworkWeight: 0 };
}
