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
| Contas (somente leitura) | `renderContasPage` ~3327 (contas fixas, faturas, 4 medidas), `billTxOf` ~3059, `billStatus` ~3052, `cardInvoices` ~3160, `cardUsed` ~3200 | `src/lib/finance/contas.ts`, `src/pages/contas` |

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
3. **Contas — o que falta** (lista e detalhe já estão no app novo, só leitura): nova/editar/excluir
   conta fixa (`billDialog` ~3102), marcar paga/recebida e desfazer (`payBillDialog` ~3063,
   `markBillPaid`, `unmarkBill`), novo/editar/excluir cartão (`cardDialog` ~3206), nova/excluir compra
   (`purchaseDialog` ~3240), pagar fatura (`payInvoiceDialog` ~3278), "Cabe no mês?" (`btnFits`) e a
   aba Calendário (`monthEvents` ~5620, `renderCalendar` ~5659).
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

### Contas: decisões de redesenho e lógica duvidosa

- **Uma lista só** por mês: contas fixas vigentes (`billApplies`) e **um item por cartão** (a fatura com a
  chave do mês, como a aba Cartões do antigo). Fatura tem o rótulo discreto "Fatura"; receita fixa
  (`kind: 'entrada'`), "Receita" e valor +verde. Ordem: vencimento, depois nome (o antigo ordenava contas
  por `dueDay` e mostrava cartões num bloco à parte).
- **Status** em texto: pendente / vence hoje / atrasada / paga (recebida) / sem compras. O "embreve"
  (≤ 7 dias) do antigo virou texto ("vence em 3 dias"). Fatura: `paga` e `atrasada` como no antigo;
  `aberta` e `fechada` viram "pendente" (o fechamento aparece no detalhe). Cartão sem nada no mês fica
  como "sem compras", R$ 0, só no filtro Todas. Duvidoso: talvez devesse sumir da lista.
- **Filtros**: Todas (padrão) / Pendentes (**tudo que falta pagar, inclusive atrasadas**) / Pagas /
  Atrasadas. A busca (sem acento) olha nome e categoria; "fatura" ou "cartão" acham os cartões.
- **Três medidas** (só gastos; antes eram quatro): **A pagar** = gastos fixos não pagos + saldo em
  aberto das faturas do mês (inclui atrasadas; o antigo separava "Contas a pagar" e "Faturas em
  aberto"); **Pago** = gastos fixos pagos + pagamentos lançados nas faturas do mês (o antigo não somava
  os pagamentos de fatura); **Em atraso** = parte de "A pagar" já vencida (novo). As receitas fixas
  saíram das medidas e viraram uma linha discreta ("Receitas fixas no mês … · falta receber …").
- **Valor de conta paga** = valor da transação lançada (`billTxOf`), como o antigo; marcada sem carteira
  (`'x'`) usa o valor cadastrado e não tem data de pagamento ("paga · venceu …").
- **Fatura que rolou** (não paga até o vencimento): no mês dela continua "atrasada" com o saldo, e o
  mesmo saldo aparece de novo dentro da fatura seguinte (`carry`). Olhando meses diferentes o valor
  aparece duas vezes — igual ao antigo ("Faturas em aberto" também somava). Duvidoso.
- **Mês**: padrão = mês de hoje (sai da URL). Navegação do primeiro dado (início de conta, mês pago,
  primeira fatura) até 12 meses à frente (ou a última parcela futura). Botão "Hoje" fora do mês atual.
- **Detalhe da conta fixa**: valor e status do mês aberto, carteira (a da transação, senão a padrão,
  com link para `/carteiras/:id`), recorrência (dia, valor cadastrado, desde/até, ativa) e histórico mês a
  mês do `startMonth` (ou do mês pago mais antigo; sem nenhum dos dois, 12 meses) até o mais tardio entre
  hoje e o mês aberto, no máximo 36 meses. Conta inativa (`active: false`) some da lista como no
  antigo, mas o link direto mostra os meses pagos. Clicar num mês do histórico troca o mês da tela.
- **Detalhe da fatura**: total, fechamento/vencimento, compras do mês, pago, falta/crédito, avisos de
  saldo anterior e de saldo que rolou (textos do antigo), limite usado (`cardUsed`: compra parcelada
  inteira, igual ao antigo) com disponível, carteira que paga (`card.walletId`, link), aba **Compras**
  (descrição `desc` → nota → categoria, data, "parcela 2/4 de R$ …") com os pagamentos e aba **Faturas**
  (todas as faturas não vazias, inclusive futuras com parcelas). Setas trocam a fatura/mês.
- **Sem gráficos** nesta tela. Sem botões de pagar/marcar/novo/editar (o app é só leitura).
- Tipo `CardPurchase` ganhou `desc` (o antigo grava a descrição nesse campo). O leitor já copiava o
  campo; nada mudou em `storage.ts`.
- Demonstração: novas contas fixas (Aluguel paga pela transação t2, Energia atrasada, Salário como
  receita recebida), descrições nas compras, uma compra a mais e a fatura do mês passado paga. Isso
  muda um pouco os números do Início/Carteiras na demonstração.

## Antes de gravar dados

O app novo é somente leitura. Para as telas com edição será preciso decidir:
- gravar em `barnabank_debts_v3` no **mesmo formato** do `saveData` (~352), incluindo os
  campos que o leitor novo ainda não tipa (`budgets`, `goals`, `nudges`, `recurring`,
  `shares`, `tgLog`, `catRules`, `invites`) — o leitor atual não os carrega, então uma
  gravação ingênua **apagaria** esses dados;
- disparar a mesma sincronização de nuvem (`cloudSchedule`, `sbSchedule`) que o antigo faz.
