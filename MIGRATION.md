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
| Pessoas (somente leitura) | `personRows` ~2049, `renderPeopleList` ~2120, `applyFilterSortSearch` ~928, `renderStats` ~824, `renderPersonPage` ~1929, `buildCard` ~1123 (parcelas/histórico), `debtLabel` ~1116, `initials` ~659, `monthEvents` ~5620, `renderChart` ~920 | `src/lib/finance/people.ts`, `src/pages/pessoas` |
| Carteiras (somente leitura) | `renderWalletsPage` ~4061, `buildWalletCard` ~4077, `walletEvents` ~127, `cardUsed` ~3200, fatura do mês (aba Cartões ~3368), `walletIconKey` ~73 | `src/lib/finance/wallets.ts`, `cardUsed` em `bills-cards.ts`, `src/pages/carteiras` |

Ficaram de fora do Início (por decisão de redesenho): previsão do fim do mês
(`monthForecast` ~5490), alertas de gastos (`renderAlerts` ~7423), cobranças/claims
(`renderClaims` ~7287), plano (`renderDashPlan` ~4864), cartão de boas-vindas
(`renderStartCard` ~5186), barra por categoria e lista "A receber" por pessoa.
Podem voltar dentro de Relatórios/Pessoas.

## Falta portar

1. **Pessoas — o que falta** (a lista e o detalhe já estão no app novo, só leitura):
   ações de dívida (nova/editar/excluir, pagamento rápido/parcial `quickPay` ~1057, quitar com
   desconto, mais prazo, renegociar, desfazer pagamento, comprovantes), cartão de grupo
   (`groupStats` ~2456, `buildGroupCard`), cobrança por WhatsApp (`whatsappMessage` ~678),
   links públicos, Telegram, etiquetas/notas da pessoa (`personExtraHtml` ~5463), confiança
   (`trustInfo` ~7866), ordenação alternativa (`sortSel`), dividir conta, placar.
2. **Carteiras — o que falta** (lista e detalhe já estão no app novo, só leitura): nova/editar/
   excluir carteira (modal ~4173), novo/editar/excluir lançamento e transferência (~4221, desfazer),
   importar extrato OFX/CSV, lançamentos recorrentes (`recurring`, ~5258/5271) e metas de economia
   (`goals`, ~4792) — as duas últimas eram abas de Carteiras no antigo.
3. **Contas** (`#pageContas` ~211): contas fixas (`billDialog` ~3102, `payBillDialog` ~3063),
   cartões (`cardDialog` ~3206, `payInvoiceDialog`), calendário (`monthEvents` ~5620).
4. **Relatórios** (`#pageRelatorios` ~245): `monthSpending` ~4536, `renderSpendBars` ~4565,
   orçamentos, metas, placar (`boardData` ~7449), gráfico de evolução (`renderEvoChart` ~4040).
5. **Transversais**: configurações (`SETTINGS_KEY`, ~9–40), busca geral, simulador, backup
   (`buildBackup` ~367), sincronização na nuvem/Supabase (~6353, ~8415), links públicos
   (`shares`), bot do Telegram (`tgLog`), atalhos de teclado (~3467).

### Pessoas: decisões de redesenho e lógica duvidosa

- **Uma lista só** em vez de "Me devem" / "Eu devo": a linha mostra o líquido
  (a receber − eu devo) com sinal e cor. Quem tem as duas coisas aparece uma vez.
- **Dívidas de grupo entram na linha da pessoa** (o antigo as tirava da lista de pessoas e
  mostrava uma linha do grupo). Não há linha/cartão de grupo nesta entrega.
- **Filtros** com a semântica das pílulas antigas: Em aberto (padrão; `pendentes`), Em atraso
  (alguma dívida com status `atrasado`), Quitados (quem tem **alguma** dívida quitada, mesmo
  com outras em aberto) e Todos. O antigo trocava para "Todos" ao digitar na busca; aqui a
  busca respeita o filtro e o estado "nada encontrado" oferece "Ver em Todos".
- **Busca** sem acento (`normTxt`) no nome e no assunto; o antigo usava só `toLowerCase`.
- **Ordem** fixa = "Vence primeiro" do antigo (atrasados, próximo vencimento, maior valor;
  desempate por nome).
- **Métricas**: A receber e Em atraso vêm de `dashboardSummary` (iguais ao Início);
  Recebido = soma de `paidAmount` das dívidas a receber (inclui encargos pagos e excedente/
  crédito, como o "Já recebido" do antigo).
- **Em atraso no detalhe** soma `overdue` só das dívidas com status `atrasado` (como o
  antigo); o Início soma `overdue` de todas as não pagas. Na prática dão o mesmo, salvo
  `dueOverride` que deixe uma parcela posterior vencida antes da primeira em aberto.
- **Iniciais** ignoram palavras sem letra inicial ("Carlos (oficina)" → "C"; antigo: "C(").
- **Linha sem nada em aberto** (ou filtro Quitados) mostra o valor quitado (recebido − pago)
  em tom neutro, como o antigo mostrava o total pago no Arquivo.
- **Calendário da pessoa** (aba): só parcelas das dívidas dela (`monthEvents` filtrado);
  o painel antigo "Atrasadas / Vencem hoje / Próximos 7 dias" e o resumo de 8 cartões saíram.
- Chave da pessoa = `nameKey` (nome sem espaços nas pontas, minúsculo), na URL
  `#/pessoas/<nome codificado>`; renomear no antigo muda o link.

### Carteiras: decisões de redesenho e lógica duvidosa

- **Hierarquia**: saldo total em destaque + só duas medidas (Entrou / Saiu no mês, de
  `monthInOut`, iguais ao Início, sem transferências). Uma linha por carteira, na ordem gravada.
- **Saldo** em cor neutra (vermelho só se negativo); o antigo pintava todo saldo de verde.
- **Tipo da carteira** não existe no antigo: o texto ("Banco", "Cartão", "Dinheiro", "Poupança"…)
  é **deduzido do ícone** (`walletKindLabel`). Ícone desconhecido/texto livre → "Carteira". Duvidoso.
- **Cartão na carteira**: o antigo não tem "carteira de cartão". Mostro na carteira os cartões cujo
  `card.walletId` aponta para ela ("Pagar a fatura com", ~3216). Cartão sem carteira não aparece
  em Carteiras (fica para Contas). Uma carteira com ícone de cartão **não** vira cartão.
- **Fatura atual** = fatura com a chave do mês de hoje (`ymOf(today)`), como a aba Cartões do antigo
  ao abrir — pode já estar fechada, e a fatura "aberta" de verdade ser a do mês seguinte. Duvidoso.
- **Limite usado** = `cardUsed` (todas as compras − todos os pagamentos, ≥ 0): conta a compra
  parcelada inteira, inclusive parcelas futuras, e ignora pagamento a mais. Igual ao antigo.
- **Detalhe**: movimentos de um mês por vez, agrupados por dia (o antigo listava tudo de uma vez),
  com filtro Todos / Entradas / Saídas / Transferências e o **saldo ao fim de cada dia** (calculado
  com todos os movimentos, independente do filtro). Pagamentos de dívida contam como entrada/saída
  ("empréstimo"). Transferências aparecem com ícone de setas e valor com sinal **sem cor**.
- Mês padrão = mês de hoje (sai da URL); navegação limitada do primeiro movimento até hoje (ou o
  último movimento, se futuro). Mês vazio oferece "Ir para <último mês com movimento>".
- **Gráfico** (aba "Saldo no tempo", carregado sob demanda): saldo diário da carteira do primeiro
  movimento até hoje, uma série só; menor e maior saldo do período.
- Sem botões de ação (lançamento, carteira, importar, editar, excluir): o app novo é só leitura.
- **Recorrentes** não são simulados: o antigo grava os lançamentos recorrentes vencidos em
  `transactions` quando é aberto; se ele não foi aberto desde o vencimento, o app novo não os mostra.
- **Leitor** (`storage.ts`): carteiras agora passam por `walletIconKey` (emoji → ícone, como o
  `loadData` ~238) e itens sem `id` são **descartados** (o antigo os mantinha); `id`/`name` viram
  texto. `card.walletId` só é mantido se for texto não vazio. Tudo na memória, nada é gravado.
- `transactions` continuam sem validação (como o antigo): valor não numérico quebraria a soma.
- Demonstração: o cartão Nubank agora é pago pela carteira Nubank (`walletId: 'w1'`).

## Antes de gravar dados

O app novo é somente leitura. Para as telas com edição será preciso decidir:
- gravar em `barnabank_debts_v3` no **mesmo formato** do `saveData` (~352), incluindo os
  campos que o leitor novo ainda não tipa (`budgets`, `goals`, `nudges`, `recurring`,
  `shares`, `tgLog`, `catRules`, `invites`) — o leitor atual não os carrega, então uma
  gravação ingênua **apagaria** esses dados;
- disparar a mesma sincronização de nuvem (`cloudSchedule`, `sbSchedule`) que o antigo faz.
