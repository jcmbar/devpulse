# Implementação das regras Compilado (v1)

Referência funcional: `docs/regras-negocio-compilado.md`.

## O que é persistido em `jira_cards`

| Campo | Origem |
| --- | --- |
| `unit_test_delivery_on` | Coluna *Entrega p/ Teste Unitário* |
| `due_on` | *Data limite* |
| `estimate_hours` / `time_spent_hours` | Convertidos para **horas decimais** |
| `difference_hours` | `time_spent − estimate` |
| `delay_days` | Dias úteis entre prazo e entrega (regra NETWORKDAYS.INTL) |
| `is_rework` / `rework_weight` | Categorias com Retrabalho / 2x / 3x |

## O que é calculado em tempo real (AppHome)

A partir dos cards do developer no período (filtro por `unit_test_delivery_on`):

- total / no prazo / em atraso / retrabalho
- horas previstas / realizadas / diferença
- aproveitamento `(no_prazo − retrabalho) / total`
- atraso médio e maior atraso

## O que vai para `productivity_snapshots`

Após cada importação, um snapshot por developer com cards no período:

- contagens, horas, atrasos, `utilization_rate`, `required_hours` (capacidade)
- `metrics.statusCounts` para gráficos futuros / painel gestor

## Capacidade / meta de horas

- Defaults em `capacity_weekday_hours` (seg–qua 8h, qui–sex 6h)
- Override opcional em `developer_monthly_capacity`
- Substitui o link Excel externo `Junho 26`

## Pendências (área do gestor)

- Tela de ranking / comparativo entre developers
- Matriz mensal de aproveitamento
- UI para editar capacidade e faixas (70/84/99/100)
- Totais do time com agregação correta (não soma de médias)
