export type ReworkDetection = {
  isRework: boolean;
  /** 0 = none, 1 = Retrabalho, 2 = Retrabalho2x, 3 = Retrabalho3x */
  reworkWeight: number;
};

/**
 * Detect rework tags in category labels.
 * Counts a card once; weight reflects the highest level found.
 */
export function detectRework(categories: string[]): ReworkDetection {
  const joined = categories.join(";").toLowerCase();

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
