# Importação de planilha (v1)

Pipeline mínimo para carregar uma planilha local (XLSX/CSV) em `imports` + `jira_cards`.

## Fluxo

1. Admin/gestor acessa `/app/imports`
2. Informa período e envia o arquivo
3. Sistema cria um registro em `imports` (`pending` → `processing`)
4. Parser `spreadsheet-v1` escolhe a aba que contém a coluna de chave (`CHAVE` / `Key` / etc.)
5. Linhas normalizadas entram em `jira_cards`
6. Importação marca `completed` com `records_count`

`productivity_snapshots` ainda **não** é calculado.

## Extensão de parsers

Parsers ficam em `src/lib/imports/parsers/`.

- `spreadsheet-v1` → versão atual
- registre novas versões em `parsers/index.ts` sem reescrever o pipeline
- o orquestrador está em `src/lib/imports/run-spreadsheet-import.ts`

## Colunas mapeadas (spreadsheet-v1)

| Campo no banco | Cabeçalhos aceitos (exemplos) |
| --- | --- |
| `jira_key` | Chave, Chave do Card, Key, Issue key, Card |
| `parent_key` | Parent, Pai, Parent Key, Epic Link |
| `summary` | Resumo, Summary, Título, Title |
| `status` | Status, Situação, State |
| `categories` | Categorias, Categoria, Category, Labels |
| `developer` (via responsável) | Responsável, Nome, Assignee, Desenvolvedor |
| e-mail do responsável | Email, E-mail, Email responsável |
| `estimate_hours` | Estimativa, Estimate, Original Estimate |
| `time_spent_hours` | Tempo Gasto, Time Spent, Horas Gastas |
| `difference_hours` | Diferença, Difference, Delta |
| `delay_days` | Atraso, Delay, Dias de Atraso |
| `started_on` | Início, Start Date, Data Início |
| `due_on` | Prazo, Due Date, Data Limite, Vencimento |
| `completed_on` | Conclusão, Resolved, Data Conclusão |

Cabeçalhos são normalizados (sem acento, minúsculo). Colunas não mapeadas ficam em `raw_payload`.
