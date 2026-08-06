export type SinteticoExportRow = {
  developerName: string;
  baseAmount: number;
  differentialAmount: number;
  discountsAmount: number;
  travelAmount: number;
  mealAmount: number;
  invoiceAmount: number;
};

export type SinteticoTableModel = {
  monthTitle: string;
  travelHeader: string;
  mealHeader: string;
  rows: SinteticoExportRow[];
  totals: {
    base: number;
    differential: number;
    discounts: number;
    travel: number;
    meal: number;
    invoice: number;
  };
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isEffectivelyZero(value: number): boolean {
  return Math.abs(value) < 0.005;
}

export function formatSinteticoMoney(value: number): string {
  const rounded = roundMoney(value);
  if (isEffectivelyZero(rounded)) {
    return "";
  }
  return rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSinteticoMoneyTotal(value: number): string {
  const rounded = roundMoney(value);
  if (isEffectivelyZero(rounded)) {
    return "-";
  }
  return rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSinteticoMonthTitle(yearMonth: string): string {
  const [year, monthPart] = yearMonth.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return yearMonth;
  }
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
    date,
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatBrDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function periodHeader(label: string, start: string, end: string): string {
  return `${label}( Período ${formatBrDate(start)} a ${formatBrDate(end)})`;
}

export function buildSinteticoTableModel(input: {
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  rows: SinteticoExportRow[];
}): SinteticoTableModel {
  const totals = input.rows.reduce(
    (acc, row) => {
      acc.base += row.baseAmount;
      acc.differential += row.differentialAmount;
      acc.discounts += row.discountsAmount;
      acc.travel += row.travelAmount;
      acc.meal += row.mealAmount;
      acc.invoice += row.invoiceAmount;
      return acc;
    },
    {
      base: 0,
      differential: 0,
      discounts: 0,
      travel: 0,
      meal: 0,
      invoice: 0,
    },
  );

  return {
    monthTitle: formatSinteticoMonthTitle(input.yearMonth),
    travelHeader: periodHeader(
      "Deslocamento",
      input.periodStart,
      input.periodEnd,
    ),
    mealHeader: periodHeader("Refeição", input.periodStart, input.periodEnd),
    rows: input.rows,
    totals,
  };
}

/** Tab-separated text so the user can paste into Excel/Sheets. */
export function buildSinteticoClipboardText(model: SinteticoTableModel): string {
  const lines: string[] = [
    [model.monthTitle, "", "", "", "", "", ""].join("\t"),
    [
      "Nome",
      "Valor Base",
      "Diferencial (+)",
      "Descontos (-)",
      "Reembolso",
      "",
      "Valor da Nota Fiscal",
    ].join("\t"),
    ["", "", "", "", model.travelHeader, model.mealHeader, ""].join("\t"),
    ...model.rows.map((row) =>
      [
        row.developerName,
        formatSinteticoMoney(row.baseAmount),
        formatSinteticoMoney(row.differentialAmount),
        formatSinteticoMoney(row.discountsAmount),
        formatSinteticoMoney(row.travelAmount),
        formatSinteticoMoney(row.mealAmount),
        formatSinteticoMoney(row.invoiceAmount),
      ].join("\t"),
    ),
    [
      "Total",
      formatSinteticoMoneyTotal(model.totals.base),
      formatSinteticoMoneyTotal(model.totals.differential),
      formatSinteticoMoneyTotal(model.totals.discounts),
      formatSinteticoMoneyTotal(model.totals.travel),
      formatSinteticoMoneyTotal(model.totals.meal),
      formatSinteticoMoneyTotal(model.totals.invoice),
    ].join("\t"),
  ];
  return lines.join("\n");
}
