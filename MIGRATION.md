# Migração — estado e decisões

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
| Pessoas | `personRows` ~2049, `renderPeopleList` ~2120, `applyFilterSortSearch` ~928, `renderStats` ~824, `renderPersonPage` ~1929, `buildCard` ~1123 (parcelas/histórico), `debtLabel` ~1116, `initials` ~659, `monthEvents` ~5620, `renderChart` ~920 | `src/lib/finance/people.ts`, `src/pages/pessoas` |
| Carteiras | `renderWalletsPage` ~4061, `buildWalletCard` ~4077, `walletEvents` ~127, `cardUsed` ~3200, fatura do mês (aba Cartões ~3368), `walletIconKey` ~73 | `src/lib/finance/wallets.ts`, `cardUsed` em `bills-cards.ts`, `src/pages/carteiras` |
| Relatórios | `renderRelatorios` ~3948, `renderCategoryBars` ~3925, `monthSpending` ~4536, `renderSpendBars` ~4565, `renderMixChart` ~4666, `renderRelCards` ~4703, `renderCompare` ~7384, `renderEvoChart` ~4040, empréstimos no período ~3972 | `src/lib/finance/reports.ts`, `src/pages/relatorios` |
| Configurações (só o que vale para o app novo) | `DEFAULT_SETTINGS` ~9, `#settingsOverlay` (index.html ~715) | `src/pages/configuracoes`, `src/lib/prefs.ts`, `src/app/theme.tsx` |
| Conta na nuvem | `sbFetch`/`sbToken` ~8266, login ~8340, `sbPull` ~8395, `SB_ERRS` ~8291 | `src/lib/cloud.ts`, `src/app/AccountDialog.tsx`, `data-context.tsx` |
| Contas | `renderContasPage` ~3327 (contas fixas, faturas, 4 medidas), `billTxOf` ~3059, `billStatus` ~3052, `cardInvoices` ~3160, `cardUsed` ~3200 | `src/lib/finance/contas.ts`, `src/pages/contas` |

Ficaram de fora do Início (por decisão de redesenho): previsão do fim do mês
(`monthForecast` ~5490), cobranças/claims
(`renderClaims` ~7287), plano (`renderDashPlan` ~4864), cartão de boas-vindas
(`renderStartCard` ~5186), barra por categoria e lista "A receber" por pessoa.
Podem voltar dentro de Relatórios/Pessoas.

## Estado

As cinco telas e as Configurações estão no app novo, **lendo e gravando** os mesmos dados do app antigo, com
sincronização para a conta (Supabase) e para o bot do Telegram (que agora vive em `bot/`).

Portado depois da leitura: escrita em Pessoas, Carteiras e Contas; orçamento, metas e recorrentes; plano;
calendário e "Cabe no mês?"; importação de extrato; comprovantes, recibo e PDF; resumo do mês em imagem; busca,
simulador, "olhinho", atalhos; backup; PWA; envio para a nuvem com o diálogo "Qual versão manter?"; criar conta e
recuperar senha; vínculo do Telegram por código.

Redesenhos e extras dos últimos dias (nada disso existe no app antigo ou mudou de forma):

- **Pessoas:** seletor Todos / Me devem / Eu devo acima da lista (`?l=`), com o valor só do lado escolhido. Dentro da pessoa, abas Me devem e Eu devo; só a primeira dívida em aberto vem aberta; ações num menu "Mais ações" e só o pagamento rápido, o WhatsApp e o Link ficam à vista. A barra do grupo é contínua, da esquerda para a direita.
- **Início:** card "Gastos fora do padrão" (`spendingAlerts`, em `src/lib/finance/alerts.ts`): categoria do mês com pelo menos 50% acima da média dos 3 meses anteriores e R$ 50 a mais, ou nova a partir de R$ 300. "Já sei" esconde por mês, na mesma chave do antigo (`barnabank_alerts_hide`).
- **Documentos imprimíveis:** Inter e Geist embutidos, cores sólidas (degradê, sombra e transparência serrilham o texto no PDF) e o tema do site (claro ou escuro, com botão para trocar na página). O ranking é sempre escuro.
- **Escolha do "Qual versão manter?":** fica na sessão (`pref`) e vale para os próximos conflitos; "manter deste aparelho" sobrescreve a linha da conta sem condição.
- **Lembretes do bot:** hora, resumo do dia, da semana (com o dia), do mês e aviso a quem te deve, em Configurações. O bot guarda por conta (`/api/prefs`) e o cron roda de hora em hora.
- **Interface:** Select e Menu próprios (lista estilizada, teclado), janelas e avisos animados, lixeira vermelha no hover.

Esta lista não foi conferida item a item contra o app antigo; ao achar diferença, registre aqui.

### Pessoas: decisões de redesenho e lógica duvidosa

- **Uma lista só** em vez de "Me devem" / "Eu devo": a linha mostra o líquido
  (a receber − eu devo) com sinal e cor. Quem tem as duas coisas aparece uma vez. Depois veio o seletor Todos / Me devem / Eu devo, que filtra a lista por lado.
- **Dívidas de grupo entram na linha da pessoa** (o antigo as tirava da lista de pessoas e
  mostrava uma linha do grupo). A linha de grupo veio depois, em `src/pages/pessoas/groups/`.
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
- Ações de escrita portadas depois da leitura: lançamento, transferência, carteira, importar extrato, editar, excluir.
- **Recorrentes**: ao abrir, o app lança os recorrentes vencidos (`runRecurring`), como o antigo.
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
- **Sem gráficos** nesta tela. Pagar, marcar, novo e editar foram portados depois.
- Tipo `CardPurchase` ganhou `desc` (o antigo grava a descrição nesse campo). O leitor já copiava o
  campo; nada mudou em `storage.ts`.
- Demonstração: novas contas fixas (Aluguel paga pela transação t2, Energia atrasada, Salário como
  receita recebida), descrições nas compras, uma compra a mais e a fatura do mês passado paga. Isso
  muda um pouco os números do Início/Carteiras na demonstração.

### Relatórios: decisões de redesenho e lógica duvidosa

- **Um gráfico por vez** (o antigo empilhava ~8 cartões em 3 seções). Período no topo (Mês / 3 meses /
  12 meses / Ano; as setas pulam o período inteiro; "Atual" volta ao de hoje) e três medidas: **Entradas**,
  **Gastos**, **Saldo do período**, com as definições do antigo (Entradas = lançamentos de entrada;
  Gastos = `monthSpending`). A variação vem em texto discreto ("+5% vs setembro"; no saldo, a diferença em
  reais). Sem comparação quando o período anterior começa antes do primeiro dado.
- **Ano** = janeiro a dezembro; no ano corrente, só até o mês de hoje, comparado aos mesmos meses do ano
  anterior. Navegação: do mês do primeiro dado até o mês de hoje (o antigo andava mês a mês sem limite).
- **Abas** (`?g=`), cada uma com tabela ("Ver tabela", `?ver=tabela`) e lista ordenada (8 linhas + "Ver todas"):

  | Aba | Cartões antigos | Lista abaixo |
  |---|---|---|
  | Entrou × saiu | medidas do topo mês a mês (novo como gráfico) + **Entradas por categoria** | entradas por categoria |
  | Saldo | Evolução do saldo em carteiras (`renderEvoChart`), recortada no período | carteiras no fim do período |
  | Categorias | Gastos por categoria + **Comparando os meses** (juntados: variação em cada linha) | categorias |
  | Fixas × cartão | Contas fixas, cartão e outros gastos (`renderMixChart`) | os três tipos |
  | Empréstimos | Empréstimos no período (2 números) → por pessoa | pessoas (link para Pessoas) |
  | Cartões | Faturas do mês por cartão (`renderRelCards`) + total por mês (novo) | cartões (link para a fatura) |

  Abas sem dado de origem somem (sem carteira → sem Saldo; sem dívida → sem Empréstimos; sem cartão → sem Cartões).
- **Barras por mês** mostram no mínimo 6 meses (como o `renderMixChart`): meses antes do período ficam
  esmaecidos e fora das medidas. Cores: dourado + dois cinzas (`--chart-*`); verde/vermelho só em valores com
  sinal. O validador do dataviz acusa "cinza sem croma" (é o pedido) e contraste < 3:1 do cinza claro;
  compensado com legenda com valores, fresta de 2px entre segmentos e a tabela.
- **Ficaram para depois** (hoje portados): orçamento, assinaturas (`detectSubs`) e "Resumo do mês" em imagem.
  Os alertas de gastos fora do padrão vieram depois, no Início.
- **Lógica duvidosa (portada igual)**: a parcela do cartão conta no **mês da compra + n**, não no mês da
  fatura (difere de Contas). Conta fixa marcada sem carteira (`'x'`) conta o valor cadastrado. Gastos de
  Relatórios ≠ "Saiu" do Início: o Início soma movimentos das carteiras (inclui pagamentos de dívida e de
  fatura, não as compras no cartão); Relatórios usa `monthSpending`. Entradas não incluem recebimentos de
  empréstimo (ficam na aba Empréstimos). Gasto sem `auto` lançado à mão para pagar fatura conta duas vezes.
- **Diferenças deliberadas**: entradas sem categoria viram "Outros" e categorias iguais sem acento/maiúsculas
  se somam (o antigo mostrava "undefined" e separava); valor não numérico é ignorado (no antigo virava NaN).
  Cartões: o valor do período é a soma das **compras** nas faturas, sem o saldo que rolou de uma fatura para
  outra (o antigo mostrava o total da fatura do mês, com o saldo anterior).
- Demonstração: 12 meses de histórico (salário, moradia, mercado, casa, transporte, lazer, investimentos);
  `t1`/`t2` ganharam `auto: 'bill:…'` (como o antigo grava ao marcar conta paga); `t0b`/`t0d` viraram
  "Investimentos" e `t2` virou "Moradia" (nota "Aluguel"). Saldos do Início/Carteiras mudam na demonstração.

### Conta na nuvem: decisões e lógica duvidosa

- **Leitura e envio**: login por senha (`/auth/v1/token`), `GET` e `PATCH` condicionado a `updated_at` em
  `/rest/v1/bb_user_state` (veja o README). Os dados baixados passam pelo mesmo `parseAppData` do `localStorage`.
- **Sessão própria** em `bbweb_session` (tokens, nunca a senha). A do antigo (`barnabank_sb`) é ignorada: o
  Supabase troca o refresh token a cada renovação, e renovar a sessão do antigo o desconectaria.
- **Prioridade**: dados da conta (se houver) > `localStorage` > demonstração. Se a conta não tem dados ou a
  rede falha, mostra os do aparelho e avisa na janela da conta. Sessão inválida (400/401/403) → sai da conta.
- **Dados só na memória**: cada abertura baixa de novo (sem internet, ficam os do aparelho).
- Quando a conta e o aparelho mudaram, o app pergunta "Qual versão manter?" (`SyncConflictDialog`), como o antigo.
- A chave publicável do Supabase está no código (como no antigo); o acesso depende do RLS da tabela.

### Configurações: decisões

- Ficou só o que o app novo usa: **conta na nuvem** (entrar/atualizar/sair; o ícone de nuvem do topo saiu,
  a engrenagem leva para cá e ganha um ponto vermelho se a conta não respondeu), **tema** (Sistema/Claro/
  Escuro), **moeda** e **formato de data**, **de onde vêm os dados** e link para o app atual, e a versão (commit).
- Moeda e data: padrão "Como no BarnaBank" (lê `barnabank_settings_v1` ou o `settings` da conta). Escolher
  outra grava só em `bbweb_prefs` e vale só no app novo; o antigo não muda.
- Na 1.0 só leitura ficaram de fora e depois foram portados: padrões (juros, multa, mora, carteira padrão), chave
  PIX, backup (exportar, importar e lembrete) e a instalação como app (PWA).

## Gravação de dados

O app grava em `barnabank_debts_v3` no **mesmo formato** do `saveData` do antigo. `src/lib/store.ts` lê o JSON
atual, troca só o que mudou e devolve o resto intacto (`budgets`, `goals`, `nudges`, `recurring`, `shares`, `tgLog`,
`catRules`, `invites`…), então uma gravação não apaga o que o app não conhece. `tgLog` e `shares` pertencem ao bot:
o app só os repassa. Cada gravação agenda o envio para a conta e para o bot (`src/lib/sync/`). Regras do bot:
[bot/ENGINE.md](bot/ENGINE.md).
