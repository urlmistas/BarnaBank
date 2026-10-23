# Motor do bot (`bot/engine.js`)

`engine.js` roda dentro do worker e aplica no servidor as mesmas regras do app antigo: parcelas, multa e mora,
resumo, previsão, links de cobrança, desfazer. É por isso que uma mensagem no Telegram entra na hora e o `/resumo`
já mostra o valor novo.

## O que ele é

- Uma **cópia congelada** do `app.js` do app antigo (repositório `barna-bank`), embrulhada por um "navegador de
  mentira" (ver o topo do arquivo). Foi gerada uma vez, a partir do `app.js` de 23/10/2026, e commitada.
- **Não há mais gerador** neste repositório. O `build-engine.mjs` antigo foi deixado de fora de propósito: o
  `app.js` não existe aqui.
- Não edite o arquivo à mão para mudar regras de negócio sem testar: são ~8.600 linhas de código do app antigo.

## O que não pode quebrar

O worker guarda e entrega o **snapshot**: o mesmo JSON do `barnabank_debts_v3` (debts, contacts, wallets,
transactions, groups, bills, cards, cardPurchases, cardPayments, budgets, goals, nudges, recurring, shares,
tgLog, catRules, invites, settings). O motor lê e grava esse formato. Por isso:

1. O app novo precisa continuar gravando o snapshot nesse formato, sem renomear campos nem remover os que ele
   ainda não conhece (o `src/lib/store.ts` já preserva as chaves desconhecidas).
2. `tgLog` e `shares` são do bot e do motor: o app novo só pode repassá-los.
3. Mudou uma regra no app novo (por exemplo, o cálculo de juros)? O bot continua com a regra velha até alguém
   atualizar o motor. Hoje as regras do app novo (`src/lib/finance/*`) são portadas das do antigo e dão os mesmos
   números, então o bot e o app concordam.

## Testes

```bash
npm run test:bot
```

- `bot/tests/test_recurring.mjs`: dívida recorrente e link "do que devo", direto no motor.
- `bot/tests/test_put_views.mjs`: o `PUT /api/state` só com snapshot recalcula resumo e links sem subir a `rev`.
- `bot/tests/botsim/server.mjs`: sobe o `worker.js` em Node com KV em memória e Telegram falso (usado pelos testes de
  navegador do app antigo; fica aqui como simulador para uso manual).

## Se um dia o motor precisar mudar

Opções, da mais barata à mais cara: corrigir o ponto exato em `engine.js` e acrescentar um teste em `bot/tests`;
ou reescrever as regras do bot em módulos próprios, reaproveitando `src/lib/finance/*` do app novo.
