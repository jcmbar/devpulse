import * as XLSX from "xlsx";

export type SinteticoExportRow = {
  developerName: string;
  baseAmount: number;
  differentialAmount: number;
  discountsAmount: number;
  travelAmount: number;
  mealAmount: number;
  invoiceAmount: number;
};

export type BuildSinteticoXlsxInput = {
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  rows: SinteticoExportRow[];
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isEffectivelyZero(value: number): boolean {
  return Math.abs(value) < 0.005;
}

/** Blank when zero (matches the finance template). */
function moneyCell(value: number): number | "" {
  const rounded = roundMoney(value);
  return isEffectivelyZero(rounded) ? "" : rounded;
}

/** Dash when zero in the total row. */
function moneyTotalCell(value: number): number | "-" {
  const rounded = roundMoney(value);
  return isEffectivelyZero(rounded) ? "-" : rounded;
}

function formatMonthTitle(yearMonth: string): string {
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

export function buildSinteticoFileName(yearMonth: string): string {
  const title = formatMonthTitle(yearMonth)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return `sintetico-${title}-${yearMonth}.xlsx`;
}

/**
 * Builds the finance “sintético” workbook:
 * month title, Nome / Valor Base / Diferencial / Descontos /
 * Reembolso (Deslocamento + Refeição) / Valor da Nota Fiscal, then Total.
 */
export function buildSinteticoWorkbook(
  input: BuildSinteticoXlsxInput,
): XLSX.WorkBook {
  const monthTitle = formatMonthTitle(input.yearMonth);
  const travelHeader = periodHeader(
    "Deslocamento",
    input.periodStart,
    input.periodEnd,
  );
  const mealHeader = periodHeader(
    "Refeição",
    input.periodStart,
    input.periodEnd,
  );

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

  const aoa: (string | number)[][] = [
    [monthTitle],
    [
      "Nome",
      "Valor Base",
      "Diferencial (+)",
      "Descontos (-)",
      "Reembolso",
      "",
      "Valor da Nota Fiscal",
    ],
    ["", "", "", "", travelHeader, mealHeader, ""],
    ...input.rows.map((row) => [
      row.developerName,
      moneyCell(row.baseAmount),
      moneyCell(row.differentialAmount),
      moneyCell(row.discountsAmount),
      moneyCell(row.travelAmount),
      moneyCell(row.mealAmount),
      moneyCell(row.invoiceAmount),
    ]),
    [
      "Total",
      moneyTotalCell(totals.base),
      moneyTotalCell(totals.differential),
      moneyTotalCell(totals.discounts),
      moneyTotalCell(totals.travel),
      moneyTotalCell(totals.meal),
      moneyTotalCell(totals.invoice),
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 5 } },
  ];
  sheet["!cols"] = [
    { wch: 36 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 42 },
    { wch: 40 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, monthTitle.slice(0, 31));
  return workbook;
}

export function buildSinteticoXlsxBytes(
  input: BuildSinteticoXlsxInput,
): Uint8Array {
  const workbook = buildSinteticoWorkbook(input);
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;
}
