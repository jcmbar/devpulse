export type DeveloperPeriodMetrics = {
  totalCards: number;
  onTimeCards: number;
  delayedCards: number;
  reworkCards: number;
  reworkWeightTotal: number;
  totalEstimateHours: number;
  totalTimeSpentHours: number;
  totalDifferenceHours: number;
  averageDelayDays: number | null;
  maxDelayDays: number | null;
  utilizationRate: number | null;
  statusCounts: Record<string, number>;
};
