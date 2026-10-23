# Migração — telas que faltam

Referência: app antigo (`index.html`, `app.css`, `app.js` ES5 com ~8500 linhas).
Linhas aproximadas de `app.js`.

## Já portado

| O quê | Antigo | Novo |
|---|---|---|
| Leitura dos dados / normalização | `loadData` ~217, `migrateDebts` ~159, `migrateFinance` ~250, `migrateGroups` ~315 | `src/lib/storage.ts` |
| Motor de parcelas, juros, multa/mora, status | ~436–648 (`computeSchedule` ~501) | `src/lib/finance/debts.ts` |
| Dívida recorrente | `syncRecurring` ~421 | `syncRecurringDebt` |
| Carteiras e saldo | `walletEvents` ~127 | `src/lib/finance/wallets.ts` |
| Contas fixas e faturas de cartão | ~3034–3205 | `src/lib/finance/bills-cards.ts` |
| Início | `renderDashboard` ~4010, `renderWeek` ~2244, fontes da semana ~2211 e ~3438, `renderTodayBanner` ~4507, `renderHomeSide` ~5561 | `src/lib/finance/dashboard.ts`, `src/pages/inicio` |

Ficaram de fora do Início (por decisão de redesenho): previsão do fim do mês
(`monthForecast` ~5490), alertas de gastos (`renderAlerts` ~7423), cobranças/claims
(`renderClaims` ~7287), plano (`renderDashPlan` ~4864), cartão de boas-vindas
(`renderStartCard` ~5186), barra por categoria e lista "A receber" por pessoa.
Podem voltar dentro de Relatórios/Pessoas.

## Falta portar

1. **Pessoas** (`#pagePessoas`, `index.html` ~82; página da pessoa ~181)
   `renderList`, `renderPeopleList`, `renderPersonPage`, `placeOpenDetail` ~2180, grupos
   (`groupStats` ~2456, exclusão ~3000), pagamento rápido/parcial (`quickPay` ~1057),
   cobrança por WhatsApp (`whatsappMessage` ~678), filtros/ordenação (`state.filter/sort`).
2. **Carteiras** (`#pageCarteiras` ~186): `renderWalletsPage` ~4061, `buildWalletCard` ~4077,
   modal de carteira ~4173, lançamentos/transferências ~4221, recorrentes.
3. **Contas** (`#pageContas` ~211): contas fixas (`billDialog` ~3102, `payBillDialog` ~3063),
   cartões (`cardDialog` ~3206, `payInvoiceDialog`), calendário (`monthEvents` ~5620).
4. **Relatórios** (`#pageRelatorios` ~245): `monthSpending` ~4536, `renderSpendBars` ~4565,
   orçamentos, metas, placar (`boardData` ~7449), gráfico de evolução (`renderEvoChart` ~4040).
5. **Transversais**: configurações (`SETTINGS_KEY`, ~9–40), busca geral, simulador, backup
   (`buildBackup` ~367), sincronização na nuvem/Supabase (~6353, ~8415), links públicos
   (`shares`), bot do Telegram (`tgLog`), atalhos de teclado (~3467).

## Antes de gravar dados

O app novo é somente leitura. Para as telas com edição será preciso decidir:
- gravar em `barnabank_debts_v3` no **mesmo formato** do `saveData` (~352), incluindo os
  campos que o leitor novo ainda não tipa (`budgets`, `goals`, `nudges`, `recurring`,
  `shares`, `tgLog`, `catRules`, `invites`) — o leitor atual não os carrega, então uma
  gravação ingênua **apagaria** esses dados;
- disparar a mesma sincronização de nuvem (`cloudSchedule`, `sbSchedule`) que o antigo faz.
