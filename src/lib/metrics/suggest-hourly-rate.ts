/**
 * Suggest hourly rate from monthly base ÷ contracted monthly hours.
 * Returns null when inputs are invalid (does not invent values).
 */
export function suggestHourlyRate(
  baseAmount: number,
  contractedHoursPerMonth: number,
): number | null {
  if (
    !Number.isFinite(baseAmount) ||
    !Number.isFinite(contractedHoursPerMonth) ||
    baseAmount < 0 ||
    contractedHoursPerMonth <= 0
  ) {
    return null;
  }
  const raw = baseAmount / contractedHoursPerMonth;
  return Math.round(raw * 10_000) / 10_000;
}
