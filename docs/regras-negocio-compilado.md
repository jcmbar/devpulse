# Regras de negócio — aba Compilado

Fonte analisada: `Análise Cards Jira.xlsx`  
Aba principal: **Compilado** (visão gerencial)  
Aba de entrada: **Base JIRA** (linhas de cards)

Este documento traduz a lógica da planilha para implementação no DevPulse.  
Não altera a planilha; serve como referência funcional.

---

## 1. Visão geral da aba Compilado

A Compilado não lista cards. Ela **agrega** a Base JIRA por desenvolvedor e por período.

Há quatro blocos:

| Bloco | Onde | Função |
| --- | --- | --- |
| Totais do time | Linha 2 (A–M) | Soma/agregação da tabela de developers |
| Tabela por developer (período ativo) | Linhas 4–9 (A–M) | KPIs do intervalo selecionado em `B12:C12` |
| Calendário anual + aproveitamento mensal | Colunas P–R + matriz A15:N19 | % de aproveitamento mês a mês e média anual |
| Meta de horas do mês | K22:N30 | Cálculo de capacidade (dias úteis × horas/dia) |

Controle de período ativo:

- `B12` = data início do intervalo
- `C12` = data fim do intervalo
- Quase todas as métricas da tabela principal filtram a Base JIRA por **data de entrega** (`Base JIRA!L` = *Entrega p/ Teste Unitário*) dentro desse intervalo.

Ano de referência do calendário: `R2` (ex.: 2026).

---

## 2. Colunas da Compilado (tabela por developer)

Cabeçalhos em `A4:M4`:

| Coluna | Nome | Origem | Tipo |
| --- | --- | --- | --- |
| A | Desenvolvedor | Lista manual / cadastro | Entrada |
| B | Total cards | Base JIRA | Calculada (`COUNTIFS`) |
| C | Média em dias de atraso | Base JIRA!N | Calculada (`AVERAGEIFS`) |
| D | Maior Atraso em dias | Base JIRA!N | Calculada (`MAXIFS`) |
| E | Cards entregues no prazo | Base JIRA | Calculada (`COUNTIFS` com atraso ≤ 0) |
| F | Cards em atraso | Derivada de B e E | Calculada (`B − E`) |
| G | Cards Retrabalhos | Base JIRA!D (categorias) | Calculada (`COUNTIFS` com curingas) |
| H | Total em horas Previstos | Base JIRA!P | Calculada (`SUMIFS`) |
| I | Total em horas Realizados | Base JIRA!Q | Calculada (`SUMIFS`) |
| J | Diferença (horas) | H e I | Calculada (`I − H`) |
| K | Total de horas Necessárias | Planilha externa `Junho 26` | Link externo (frágil) |
| L | Diferença | I e K | Calculada (`I*24 − K`) |
| M | Aproveitamento (%) | E, G, B | Calculada (`(E − G) / B`) |

Faixas de classificação (aparentemente para formatação/leitura, sem `SE` explícito ligado à coluna M no trecho analisado):

| Rótulo | Limite |
| --- | --- |
| Muito abaixo | 70% |
| Abaixo | 84% |
| Na Média | 99% |
| Excelente | 100% |

---

## 3. Campos da Base JIRA usados pela Compilado

| Coluna Base | Nome | Papel na Compilado |
| --- | --- | --- |
| D | Categorias | Detecta retrabalho (`*Retrabalho*`, `*Retrabalho2x*`) |
| J | Data limite | Usada no cálculo de atraso (na Base) |
| L | Entrega p/ Teste Unitário | **Filtro de período** e base do atraso |
| N | Atraso | Média, máximo, “no prazo” |
| P | Tempo Estimado | Horas previstas |
| Q | Tempo Atuado | Horas realizadas |
| S | Responsável | Chave de agrupamento por developer |

### 3.1 Fórmulas importantes já na Base (antes da Compilado)

Estas colunas da Base são **derivadas**, não brutas do Jira:

#### Atraso (`N`)

```excel
=IF(L=J, 0,
  IF(L>J,
    NETWORKDAYS.INTL(J, L, 1) - 1,
    -(NETWORKDAYS.INTL(L, J, 1) - 1)
  )
)
```

Regra em linguagem simples:

- Compara **entrega** (`L`) com **prazo** (`J`) em dias úteis.
- Entrega = prazo → atraso `0`.
- Entrega depois do prazo → atraso **positivo**.
- Entrega antes do prazo → atraso **negativo** (adiantamento).
- Fim de semana não conta (`NETWORKDAYS.INTL` com weekend = sábado/domingo).

#### Tempo Estimado (`P`) e Tempo Atuado (`Q`)

```excel
P = Estimativa original / 86400   // vira fração de dia (Excel time)
Q = Tempo gasto / 86400
```

Na prática, Jira exporta segundos; a planilha converte para “hora Excel”.  
Na Compilado, `SUMIFS` soma essas frações e a UI mostra horas.

#### Diferença de horas na Base (`R`)

Formatação textual de `Q − P` (não é a mesma “Diferença” da Compilado coluna J/L).

#### Dias da semana (`I`, `K`, `M`) e Dias em Desenvolvimento (`O`)

Auxiliares de leitura; a Compilado **não** agrega esses campos.

---

## 4. Colunas calculadas da Compilado — detalhe

### 4.1 Total cards (`B`)

```excel
=COUNTIFS(
  'Base JIRA'!S:S, A{row},
  'Base JIRA'!L:L, ">="&$B$12,
  'Base JIRA'!L:L, "<="&$C$12
)
```

- Origem: responsável + entrega no intervalo.
- Negócio: quantos cards o developer entregou no período.

### 4.2 Média em dias de atraso (`C`)

```excel
=AVERAGEIFS(
  'Base JIRA'!N:N,
  'Base JIRA'!S:S, A{row},
  'Base JIRA'!L:L, ">="&$B$12,
  'Base JIRA'!L:L, "<="&$C$12
)
```

- Negócio: atraso médio (pode ser negativo se houver entregas adiantadas).
- Fragilidade: com 0 cards → `#DIV/0!`.

### 4.3 Maior atraso em dias (`D`)

```excel
=MAXIFS('Base JIRA'!N:N, ...mesmo filtro...)
```

- Negócio: pior atraso do período (valor máximo de `N`).

### 4.4 Cards entregues no prazo (`E`)

```excel
=COUNTIFS(..., 'Base JIRA'!N:N, "<=0")
```

- Negócio: card no prazo se `atraso <= 0` (inclui adiantados).

### 4.5 Cards em atraso (`F`)

```excel
= [Total cards] - [Cards entregues no prazo]
```

- Negócio: complementares; não há filtro direto `N>0` (equivalente na prática).

### 4.6 Cards Retrabalhos (`G`)

```excel
=COUNTIFS(..., 'Base JIRA'!D:D, "*Retrabalho*")
 + COUNTIFS(..., 'Base JIRA'!D:D, "*Retrabalho2x*")
```

- Negócio: conta cards cuja categoria contém “Retrabalho” e/ou “Retrabalho2x”.
- Fragilidade: se a categoria tiver os dois tokens, o card pode ser **contado duas vezes**.

### 4.7 Horas previstas (`H`) / realizadas (`I`) / diferença (`J`)

```excel
H = SUMIFS('Base JIRA'!P:P, ...)
I = SUMIFS('Base JIRA'!Q:Q, ...)
J = I - H
```

- Negócio: esforço estimado vs atuado no período; diferença positiva = gastou mais que o previsto (na escala de tempo Excel).

### 4.8 Horas necessárias (`K`) e diferença vs meta (`L`)

```excel
K = '[1]Junho 26'!$F$41   // (célula muda por developer)
L = I*24 - K
```

- `K` vem de **outro arquivo Excel** (capacidade/meta do mês).
- `I*24` converte fração-de-dia Excel para horas.
- Negócio: realizado vs meta de horas disponíveis.
- Fragilidade alta: link externo quebrado / nome de arquivo antigo / células hard-coded por pessoa.

### 4.9 Aproveitamento (%) (`M`) — métrica-chave

```excel
=(E - G) / B
```

Em linguagem simples:

> Percentual de cards “bons” no período =  
> (cards no prazo − cards de retrabalho) ÷ total de cards.

Observações:

- Retrabalho **penaliza** mesmo que o card tenha sido no prazo.
- Com `B = 0` → erro `#DIV/0!`.
- Totais do time usam `(E2 − G2) / B2` (mesma regra no agregado).

Não há `PROCV` / `ÍNDICE` / `CORRESP` nesta aba. O padrão dominante é `COUNTIFS` / `SUMIFS` / `AVERAGEIFS` / `MAXIFS` + `IFERROR`.

---

## 5. Matriz anual de aproveitamento (A15:N19)

Para cada developer e cada mês:

```excel
=IFERROR(
  (
    COUNTIFS(... mês ..., N, "<=0")
    - COUNTIFS(... mês ..., D, "*Retrabalho*")
    - COUNTIFS(... mês ..., D, "*Retrabalho2x*")
  ) / COUNTIFS(... mês ...),
  0
)
```

- Mesma definição de aproveitamento, calculada mês a mês.
- Intervalos mensais vêm de `Q4:R15` gerados por `DATE($R$2, mês, 1)`.
- Coluna **Média** (`N`):

```excel
=SUM(B:M) / $M$15
```

onde `M15 = 12` (“Comparativo de 12 Meses”).

Fragilidade: meses sem entrega entram como `0%` e **puxam a média para baixo** (divide sempre por 12, não pela quantidade de meses com dados).

---

## 6. Bloco “Cálculo de horas para o mês” (capacidade)

| Célula | Fórmula / valor | Negócio |
| --- | --- | --- |
| K24 | Data de início do mês | Entrada |
| L24 | Dias corridos do mês | Calendário |
| M24 | `NETWORKDAYS(...)` | Dias úteis |
| K26:K30 | 1..5 (seg–sex) | Dias da semana |
| L26:L30 | 8,8,8,6,6 | Horas-alvo por tipo de dia |
| M26:M30 | Contagem de cada weekday no mês | `SUMPRODUCT` + `WEEKDAY` |
| N24 | `SUMPRODUCT(L26:L30, M26:M30)` | **Meta em horas do mês** |

Regra de capacidade observada:

- Segunda a quarta: **8h**
- Quinta e sexta: **6h**
- Meta mensal ≈ soma (ocorrências do dia × horas do dia)

Isso explica a ideia de “horas necessárias”, hoje parcialmente alimentada pelo arquivo externo.

---

## 7. Funções Excel encontradas (destaque)

| Família | Onde aparece | Uso |
| --- | --- | --- |
| `COUNTIFS` | Total cards, no prazo, retrabalho, matriz mensal | Contagens condicionais |
| `SUMIFS` | Horas previstas/realizadas | Somas condicionais |
| `AVERAGEIFS` | Média de atraso | Média condicional |
| `MAXIFS` | Maior atraso | Máximo condicional |
| `IF` / `IFERROR` | Atraso na Base; matriz mensal | Condicionais e proteção de divisão |
| `NETWORKDAYS` / `NETWORKDAYS.INTL` | Atraso e dias úteis | Calendário útil |
| `DATE` | Calendário anual | Início/fim de mês |
| `SUMPRODUCT` | Meta de horas | Capacidade ponderada |
| `SUM` | Totais e média anual | Agregação |
| `PROCV` / `VLOOKUP` | **Não encontrado** na Compilado | — |
| `ÍNDICE` / `CORRESP` | **Não encontrado** na Compilado | — |

Arredondamentos: principalmente formatação de exibição (`-1.5`, `98%`), não `ARRED` explícito nas fórmulas da Compilado.

Tratamento de vazio:

- `IFERROR(..., 0)` na matriz mensal.
- Tabela principal **não** protege divisão por zero (média/aproveitamento quebram com 0 cards).

---

## 8. Visão DEV vs ADM/GESTOR

### 8.1 Importante para o DEV (área individual)

- Total de cards no período
- Cards no prazo / em atraso
- Atraso médio e maior atraso
- Horas previstas vs realizadas e diferença
- Aproveitamento (%) do período
- Cards de retrabalho (penalidade)
- (Futuro) realizado vs meta de horas do mês
- Evolução mensal do aproveitamento

### 8.2 Importante para ADM/GESTOR (visão do time)

- Totais agregados do time no período
- Ranking / comparação de aproveitamento entre developers
- Matriz anual mês a mês (tendência)
- Média anual de aproveitamento
- Volume de retrabalho do time
- Meta de capacidade do mês e saldo de horas
- Faixas: Muito abaixo / Abaixo / Na média / Excelente

---

## 9. Ambiguidades, duplicidades e fragilidades

1. **Filtro de período pela entrega (`L`)**, não pela data de início nem pelo status Jira — precisa ficar explícito no produto.
2. **Aproveitamento penaliza retrabalho** mesmo se o card estava no prazo; a fórmula `(no_prazo − retrabalho) / total` pode ficar estranha se retrabalho > no_prazo.
3. **Dupla contagem de Retrabalho + Retrabalho2x** no mesmo card.
4. **`SUM` de médias de atraso** na linha de totais (C2) não é média ponderada do time.
5. **Horas em formato Excel time** (`/86400`) confundem interpretação; DevPulse deve persistir **horas decimais**.
6. **`K` (horas necessárias)** depende de arquivo externo `Junho 26` — link quebradiço e hard-coded por pessoa.
7. **Média anual divide sempre por 12**, incluindo meses zerados.
8. **Lista de developers é manual** na Compilado (não dinâmica a partir da Base).
9. **Dois significados de “Diferença”**: horas estimado×realizado (`J`) vs realizado×meta (`L`).
10. Valores anômalos de atraso na Base em algumas linhas antigas (quando datas inválidas/ausentes) — validação necessária na importação.
11. Categorias compostas (`Financeiro;Retrabalho`) funcionam via curinga, mas a semântica de múltiplos labels precisa de modelo próprio no DevPulse.

---

## 10. Proposta de tradução para o DevPulse

### 10.1 Persistir (campos / tabelas)

| Conceito | Onde |
| --- | --- |
| Card bruto Jira (chave, resumo, status, responsável, datas, estimativa, tempo gasto, categorias, parent) | `jira_cards` (+ `raw_payload`) |
| Atraso em dias úteis | `jira_cards.delay_days` (recalcular na importação com a regra `NETWORKDAYS`) |
| Flag / tipo de retrabalho | Preferir campo derivado ou tag normalizada (`is_rework`, `rework_level`) |
| Developer | `developers` |
| Período de importação / análise | `imports` (`period_start`, `period_end`) |
| Capacidade mensal / horas por weekday | Nova tabela de configuração (substituir link `Junho 26`) |
| Faixas de aproveitamento (70/84/99/100) | Configuração de métricas |

### 10.2 Calcular em tempo real (API / AppHome)

- Total cards, no prazo, em atraso
- Média e máximo de atraso
- Soma de horas estimadas / realizadas / diferença
- Aproveitamento do período selecionado
- Contagem de retrabalho (sem dupla contagem)
- Breakdown por status (já preparado)

### 10.3 Snapshot por período (`productivity_snapshots`)

Gravar após importação (ou job noturno) por `developer_id` + período:

- `cards_count`
- `completed_on_time_count` (atraso ≤ 0)
- `delayed_cards_count`
- `rework_cards_count`
- `total_estimate_hours`
- `total_time_spent_hours`
- `total_difference_hours`
- `avg_delay_days`
- `max_delay_days`
- `utilization_rate` (aproveitamento)
- `metrics` JSON: série mensal, meta de horas, saldo vs meta, classificação da faixa

### 10.4 Pode deixar de existir (ou não portar 1:1)

- Dias da semana textuais (`TEXT(..., "dddd")`)
- Formatação textual da diferença de horas na Base
- Links para arquivos Excel externos
- Tabela Compilado com developers hard-coded
- `#DIV/0!` / `IFERROR` improvisados — tratar no código
- Soma ingênua de médias na linha “Totais” (substituir por agregação correta)

---

## 11. Regras de negócio canônicas (para o código)

Definições recomendadas no DevPulse:

1. **Card no período**  
   `completed_on` (ou campo mapeado de *Entrega p/ Teste Unitário*) ∈ `[period_start, period_end]`.

2. **Atraso (dias úteis)**  
   `delay_days = businessDays(due_on, completed_on)` com sinal:  
   positivo = atrasado, negativo = adiantado, 0 = no dia.

3. **No prazo**  
   `delay_days <= 0`.

4. **Em atraso**  
   `delay_days > 0`.

5. **Retrabalho**  
   categorias contêm `Retrabalho` (contar **uma vez** por card; níveis 2x/3x podem ser metadado).

6. **Aproveitamento**  
   `(on_time_count - rework_count) / cards_count`, protegido contra divisão por zero.  
   (Validar com stakeholders se a penalização de retrabalho deve continuar exatamente assim.)

7. **Horas**  
   sempre em horas decimais (`estimate_seconds / 3600`), nunca fração Excel.

8. **Meta mensal**  
   configurar horas por weekday × contagem de dias úteis do mês (bloco K22:N30).

---

## 12. Próximos passos sugeridos no DevPulse

1. Ajustar o parser/import para mapear explicitamente:
   - `Entrega p/ Teste Unitário` → `completed_on`
   - `Data limite` → `due_on`
   - `Estimativa original` / `Tempo gasto` (segundos) → horas
   - recalcular `delay_days` com a regra de dias úteis
2. Implementar serviço de métricas do Compilado (por developer + período).
3. Popular `productivity_snapshots` com aproveitamento e retrabalho.
4. Criar configuração de capacidade mensal (substituir Excel externo).
5. Tela gestor: ranking + matriz mensal de aproveitamento.
6. Confirmar com o time se a fórmula de aproveitamento `(no_prazo − retrabalho) / total` deve ser preservada ou revisada.
