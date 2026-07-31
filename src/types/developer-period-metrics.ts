export type DeveloperPeriodMetrics = {
  totalCards: number;
  onTimeCards: number;
  /** Contagem líquida de cards em atraso (bruto − acatados). Painel/ranking. */
  delayedCards: number;
  /** Cards com Entrega TU > due_on (antes de aceites). */
  delayedCardsGross: number;
  /** Subconjunto do bruto com justificativa aceita no lote. */
  delayedCardsAccepted: number;
  /** Alias explícito do líquido (= delayedCards). */
  delayedCardsNet: number;
  reworkCards: number;
  /** Soma dos pesos de retrabalho (Retrabalho=1, 2x=2, 3x=3…). */
  reworkWeightTotal: number;
  totalEstimateHours: number;
  totalTimeSpentHours: number;
  totalDifferenceHours: number;
  /** Soma dos dias de atraso (delay_days > 0) no período. */
  totalDelayDays: number;
  averageDelayDays: number | null;
  maxDelayDays: number | null;
  /**
   * Penalidade do aproveitamento: P = 1·A_líquido + 2·R.
   * R = reworkWeightTotal.
   */
  utilizationPenalty: number;
  /** Capacidade aproveitada em cartões equivalentes: C − P (pode ser < 0). */
  utilizedCardEquivalents: number;
  /**
   * Aproveitamento como fração 0–1 (qualidade):
   * C > 0 → max(0, (C − P) / C); C = 0 → 0.
   */
  utilizationRate: number;
  /**
   * Índice de Entrega: I = Q × √C (C = 0 → 0).
   * Qualidade ponderada pelo volume do período.
   */
  deliveryIndex: number;
  statusCounts: Record<string, number>;
};
