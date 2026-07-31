type MetricsLegendProps = {
  /**
   * Hint under the two metric blurbs.
   * Defaults to ranking-oriented copy (Gestor table).
   */
  hint?: string;
};

const DEFAULT_HINT =
  "Passe o mouse (ou toque) no valor de Aproveitamento ou Índice para ver a memória de cálculo.";

/**
 * Compact legend for Aproveitamento + Índice (Gestor ranking / Home do developer).
 */
export function RankingMetricsLegend({
  hint = DEFAULT_HINT,
}: MetricsLegendProps = {}) {
  return (
    <aside className="ui-metrics-legend" aria-label="Como ler as métricas">
      <div className="ui-metrics-legend__item">
        <p className="ui-metrics-legend__title">Aproveitamento</p>
        <p className="ui-metrics-legend__text">
          Mostra a qualidade da entrega no período. Cada atraso reduz 1 card útil
          e cada retrabalho reduz 2. Quanto maior o percentual, melhor.
        </p>
      </div>
      <div className="ui-metrics-legend__item">
        <p className="ui-metrics-legend__title">Índice</p>
        <p className="ui-metrics-legend__text">
          Combina qualidade e volume de entrega. É calculado como Aproveitamento
          × raiz quadrada do total de cards. Quanto maior o índice, melhor o
          desempenho no ranking.
        </p>
      </div>
      {hint ? <p className="ui-metrics-legend__hint">{hint}</p> : null}
    </aside>
  );
}
