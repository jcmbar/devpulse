# DevPulse — Métricas V1 (especificação funcional)

Documento oficial das métricas de produtividade do Compilado usadas no **Início** (developer) e no **Gestor** (ranking / analítico).

Escopo: cards com **Entrega p/ Teste Unitário** (`unit_test_delivery_on`) no período e lote Compilado selecionados.

---

## 1. Variáveis por developer

| Símbolo | Nome | Definição |
|--------|------|-----------|
| **C** | Cards | Total de cards com `unit_test_delivery_on` no período (lote ativo). |
| **N** | No prazo | Cards com `unit_test_delivery_on ≤ due_on`. |
| **A_b** | Atraso bruto | Cards com `unit_test_delivery_on > due_on`. |
| **A_a** | Atraso acatado | Subconjunto de A_b com justificativa `accepted` no mesmo `import_id`. |
| **A_l** | Atraso líquido | `A_b − A_a` (o que o painel/ranking exibe como Atraso). |
| **R** | Retrabalho | Soma dos **pesos** de retrabalho detectados via category/labels (`detectRework`): Retrabalho = 1, 2x = 2, 3x = 3, … |
| **P** | Penalidade | `P = 1·A_l + 2·R` |
| **C_aprov** | Cartões equivalentes aproveitados | `C − P` (pode ser < 0 antes do floor no %) |
| **Q** | Aproveitamento | Qualidade da entrega (fração 0–1) |
| **I** | Índice de Entrega | Qualidade ponderada pelo volume |

Cards sem `due_on` (ou sem Entrega TU) entram em **C**, mas **não** em N nem em A_b.

---

## 2. Atraso bruto × líquido e justificativas

1. O atraso **bruto** não é alterado no Compilado (`jira_cards` / flags).
2. O developer pode **justificar** um atraso bruto no Início (texto obrigatório → `pending`).
3. O gestor **aceita** ou **rejeita** no drill-down de Atraso (nota obrigatória).
4. Aceites amarram ao lote (`import_id` + `jira_key` + `developer_id`). Rematerializar = lote novo, sem carregar aceites antigos.
5. **Ranking / KPI “Atrasados”** usam **A_l** (líquido).
6. **Auditoria** lista atrasos **brutos**, com badges Pendente / Acatado / Rejeitado.

Tabela: `delay_justification_requests`.

---

## 3. Aproveitamento (qualidade)

```
P = 1 × A_l + 2 × R
C_aprov = C − P

se C > 0:  Q = max(0, C_aprov / C)
se C = 0:  Q = 0
```

Exibição: **Aproveitamento%** = `Q × 100` (nunca negativo).

Interpretação didática:

- Cada atraso **líquido** reduz 1 ponto da capacidade aproveitada.
- Cada unidade de **retrabalho** (peso) reduz 2 pontos.
- O % responde “quanto da entrega foi aproveitada após descontos”, **não** “quem entregou mais”.

---

## 4. Índice de Entrega (qualidade × volume)

```
I = Q × √C
se C = 0: I = 0
```

O ranking do Gestor é ordenado por **I** (desempate: Q → C → nome).

Interpretação:

- Favorece quem entrega **volume** com boa qualidade.
- Não substitui o Aproveitamento: Q continua sendo a coluna de qualidade.

Exemplo de referência:

| Developer | C | A_l | R | Q | I |
|-----------|---|-----|---|---|---|
| Dev 1 | 40 | 0 | 0 | 100% | 6,32 |
| Dev 2 | 150 | 10 | 0 | 93,3% | 11,43 |

---

## 5. Colunas do ranking (Gestor)

| Coluna | O que mostra |
|--------|----------------|
| Cards | C |
| No prazo | N |
| Atraso | A_l (tooltip: bruto · acatado · líquido) |
| Retrabalho | R (pesos; drill-down lista cards com retrabalho) |
| Aproveitamento | Q (qualidade) |
| Índice de Entrega | I (ordenação) |
| Capacidade / Diff horas | Meta vs horas realizadas (fora desta especificação de Q/I) |

---

## 6. Totais do time

As mesmas fórmulas sobre **somas** do período:

- `C_time = Σ C`, `A_l_time = Σ A_l`, `R_time = Σ R`
- `Q_time` e `I_time` com as fórmulas das seções 3 e 4

Não usar média aritmética das taxas individuais.

---

## 7. Onde vive no código

| Peça | Arquivo |
|------|---------|
| Flags N / A_b / retrabalho | `src/lib/metrics/developer-period.ts` (`getCardDeliveryFlags`) |
| Q, P, C_aprov, I | `computeUtilizationBreakdown` / `computeDeveloperPeriodMetrics` |
| Tipos | `src/types/developer-period-metrics.ts` |
| Overlay de aceites | `src/services/delay-justifications/` + `getGestorDashboard` |
| Ranking UI | `src/app/app/gestor/page.tsx` |
| Início do developer | `src/app/app/app-home.tsx` |

---

## 8. Limitações V1

- Sem justificativa de retrabalho / “no prazo”.
- Sem desfazer aceite (exceto novo lote ou SQL).
- Sem notificações; gestor vê pedidos no drill-down de Atraso.
- Analítico usa a mesma lógica de Q/I sobre o filtro atual da base.
- Capacidade (horas/meta) é métrica paralela, não entra em Q nem I.

---

## 9. Textos canônicos na UI

**Developer (Início):**

> Seu aproveitamento mostra quanto das suas entregas do período foi aproveitado após descontar atrasos e retrabalhos. Cada atraso líquido reduz 1 ponto do aproveitamento e cada retrabalho reduz 2. Já o Índice de Entrega combina essa qualidade com o volume de cards que você entregou no período.

> De X cards entregues, Y foram aproveitados após descontar atrasos e retrabalhos.

**Gestor:**

> O Aproveitamento mostra a qualidade das entregas no período, considerando penalidades por atraso líquido e retrabalho. O Índice de Entrega usa essa qualidade ponderada pelo volume de cards entregues, para tornar o ranking mais justo entre developers com cargas diferentes. O atraso exibido no ranking é líquido, mas a auditoria mantém os atrasos brutos e o histórico das justificativas aceitas ou rejeitadas.

> Ordenado por Índice de Entrega: qualidade da entrega ponderada pelo volume do período.
