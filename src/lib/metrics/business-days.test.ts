import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDeliveryDelayDays } from "./business-days.ts";

/**
 * Regression for AP-7116:
 * due_on 2026-07-24 (sexta), Entrega TU 2026-07-25 (sábado).
 * O card aparecia classificado como "Atraso" com "0 d" porque a classificação
 * comparava datas de calendário e a coluna usava dias úteis. Ambas agora usam
 * este cálculo.
 */
describe("computeDeliveryDelayDays", () => {
  it("entrega no sábado seguinte ao prazo não gera dia útil de atraso", () => {
    assert.equal(
      computeDeliveryDelayDays({
        dueOn: "2026-07-24",
        deliveryOn: "2026-07-25",
      }),
      0,
    );
  });

  it("entrega no domingo seguinte ao prazo também é 0", () => {
    assert.equal(
      computeDeliveryDelayDays({
        dueOn: "2026-07-24",
        deliveryOn: "2026-07-26",
      }),
      0,
    );
  });

  it("entrega na segunda seguinte conta 1 dia útil", () => {
    assert.equal(
      computeDeliveryDelayDays({
        dueOn: "2026-07-24",
        deliveryOn: "2026-07-27",
      }),
      1,
    );
  });

  it("entrega no prazo é 0", () => {
    assert.equal(
      computeDeliveryDelayDays({
        dueOn: "2026-07-24",
        deliveryOn: "2026-07-24",
      }),
      0,
    );
  });

  it("entrega antecipada não vira atraso negativo", () => {
    assert.equal(
      computeDeliveryDelayDays({
        dueOn: "2026-07-24",
        deliveryOn: "2026-07-20",
      }),
      0,
    );
  });

  it("sem prazo ou sem Entrega TU retorna null", () => {
    assert.equal(
      computeDeliveryDelayDays({ dueOn: null, deliveryOn: "2026-07-25" }),
      null,
    );
    assert.equal(
      computeDeliveryDelayDays({ dueOn: "2026-07-24", deliveryOn: null }),
      null,
    );
  });
});
