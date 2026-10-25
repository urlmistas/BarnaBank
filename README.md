# BarnaBank Web

[urlmistas.github.io/BarnaBank](https://urlmistas.github.io/BarnaBank/)

Interface nova do BarnaBank (controle de dívidas, contas e carteiras), feita em React. Ela lê e grava os mesmos dados
do app antigo (`barna-bank`), com o mesmo formato, e no repositório também está o bot do Telegram (`bot/`).

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Resumo do dia, a semana, o que vence e o que está atrasado. |
| **Pessoas** | Saldo líquido por pessoa, filtros e busca. Nova dívida, pagamento rápido e parcial, quitar, renegociar, desfazer, comprovantes e recibo em PDF, cobrança por WhatsApp e link, grupos, placar. |
| **Carteiras** | Saldo, extrato do mês e gráfico. Nova carteira, lançamentos, transferências, "Repetir todo mês" e importação de extrato (OFX/CSV). |
| **Contas** | Contas fixas e faturas de cartão por mês. Marcar paga, cartões, compras, pagar fatura, calendário e "Cabe no mês?". |
| **Relatórios** | Período, medidas, gráficos e tabela, orçamento do mês, metas, plano e resumo do mês em imagem. |
| **Configurações** | Conta, Telegram, aparência, formatos, padrões (juros, multa, PIX), atalhos, dados, backup e instalação. |

Também: busca geral (`Ctrl+K` ou `/`), simulador de empréstimo, "olhinho" para esconder valores, atalhos de teclado,
tema escuro por padrão, layout para celular e desktop, PWA instalável e filtros guardados na URL.

## De onde vêm os dados e como sincroniza

Os dados **deste aparelho** são sempre a fonte: o app lê e grava no `localStorage` (`barnabank_debts_v3` e
`barnabank_settings_v1`, as mesmas chaves do BarnaBank antigo). A conta e o bot recebem cópias. Ordem de leitura:

1. `?dados=demo` ou `?dados=vazio` na URL (para revisão; nada é gravado nem sincronizado).
2. O `localStorage` deste aparelho.
3. Sem nada disso, **dados de demonstração** (selo "Demonstração" no topo).

Cada gravação preserva os campos que o app não edita (`shares`, `tgLog`, `catRules`, `invites`…): o JSON atual é lido,
só o que mudou é trocado e o resto volta intacto. O `localStorage` só é compartilhado na mesma origem; em `localhost`
não há os dados do app publicado, e aparece a demonstração.

### Conta na nuvem (Supabase)

Entre em **Configurações → Conta**. O app sincroniza com a linha da sua conta na tabela `bb_user_state` (a mesma do
BarnaBank antigo): sobe os dados a cada alteração (com uma pausa de 1,5 s para juntar mudanças), confere ao voltar
para a janela e logo depois de entrar. O envio só vale se a conta não mudou em outro aparelho desde a última leitura
(`PATCH` condicionado a `updated_at`).

| Situação | O que acontece |
|---|---|
| Conta sem dados, aparelho com dados | O aparelho sobe para a conta. |
| Aparelho vazio, conta com dados | O aparelho adota os dados da conta. |
| Só o aparelho mudou | Envia para a conta. |
| Só a conta mudou | O aparelho adota a conta. |
| Os dois mudaram | Pergunta **"Qual versão manter?"**: usar a da conta ou manter a deste aparelho. "Decidir depois" não troca nada. |

Antes de trocar os dados do aparelho pelos da conta, o texto anterior é guardado em `bbweb_backup_prev` (só a cópia mais
recente), para recuperar se algo der errado. Sem internet, os dados continuam salvos aqui e vão quando a conexão
voltar. Se a sessão expirar, o app sai da conta e **nenhum dado é apagado**.

### Bot do Telegram

Há dois modos, e convivem no mesmo worker:

- **Conta (bot compartilhado):** em **Configurações → Telegram**, logado, gere um código e mande ao bot. Só aparece
  quando o build tem `VITE_BOT_URL` (variável `BOT_URL` do repositório, veja Publicação).
- **Antigo (um dono só):** informe o endereço do bot e a chave (`SYNC_KEY`). Fica em `barnabank_cloud`, a mesma chave
  do app antigo, então quem já configurou não digita de novo.

O bot aplica sozinho as mensagens do Telegram (ele tem as mesmas regras do app); o app envia os dados do aparelho
quando mudam e adota a versão do bot quando só o bot mudou. A chave só viaja no cabeçalho `Authorization`, nunca na
URL, e não aparece em mensagens de erro. Instalação e detalhes: [bot/README.md](bot/README.md).

### O que o app novo grava no navegador

| Chave | Conteúdo |
|---|---|
| `barnabank_debts_v3`, `barnabank_settings_v1` | Os dados (mesmo formato do app antigo). |
| `barnabank_cloud` | Endereço e chave do bot, e o controle da última sincronização. |
| `barnabank_hide_values` | Se os valores estão escondidos. |
| `barnabank_last_export`, `barnabank_backup_banner_snooze` | Controle do lembrete de backup. |
| `bbweb_theme`, `bbweb_prefs`, `bbweb_shortcuts` | Tema, moeda e formato de data, atalhos ligados ou não. |
| `bbweb_session` | Sessão do login na nuvem, com `rev` e `synced` da última sincronização. |
| `bbweb_backup_prev` | Cópia dos dados de antes da última vez que a nuvem os substituiu. |

A sessão do app antigo (`barnabank_sb`) não é lida nem renovada, para não derrubar o login dele. "Sair" em
Configurações só apaga `bbweb_session`; os dados continuam no aparelho.

## Rodar localmente

Requer Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/BarnaBank/
npm test           # testes (vitest): lógica financeira, telas, nuvem e sincronização
npm run test:bot   # testes do worker do bot
npm run lint       # oxlint
npm run build      # tsc + vite build, gera dist/
npm run preview    # serve o dist/ em http://localhost:4173/BarnaBank/
```

Para revisar estados: `http://localhost:5173/BarnaBank/?dados=demo` ou `?dados=vazio`.

## Stack

Vite, React, TypeScript, Tailwind CSS v4, componentes no estilo shadcn/ui (`src/components/ui`), Recharts, Motion,
lucide-react e Inter (`@fontsource-variable/inter`). Testes com vitest, jsdom e Testing Library. Lint com oxlint.

## Estrutura

```
src/
  app/            shell (cabeçalho, abas, barra inferior), tema, contexto de dados, diálogo de login
  components/ui/  button, card, badge, skeleton, tabs, segmented, input, error-boundary (base shadcn/ui)
  lib/
    storage.ts    leitor do localStorage + fallback de demonstração
    store.ts      gravação preservando os campos desconhecidos
    cloud.ts      login e leitura da conta no Supabase
    sync/         envio para a conta e para o bot, vínculo com o Telegram
    backup/       exportar e importar backup
    pwa/          instalação (manifest e service worker em public/)
    prefs.ts      preferências de moeda e data
    demo-data.ts  dados fictícios relativos à data de hoje
    finance/      lógica pura portada do app antigo, com testes
  pages/          Início, Pessoas, Carteiras, Contas, Relatórios e Configurações
bot/              worker do Telegram (Cloudflare), publicado por .github/workflows/bot.yml
scripts/          gen-icons.mjs (ícones do PWA)
screenshots/      capturas das telas (desktop 1440 / celular 390, escuro e claro)
```

Os tokens de cor, tipografia e raios ficam em `src/index.css` (variáveis CSS mapeadas no Tailwind via `@theme`).
As rotas usam `HashRouter` (`/BarnaBank/#/pessoas`), então recarregar a página não dá 404 no GitHub Pages.

## Publicação

O repositório é `urlmistas/BarnaBank` e o site é publicado no GitHub Pages. O `vite.config.ts` usa
`base: '/BarnaBank/'`. O workflow `.github/workflows/deploy.yml` roda lint, testes e build e publica `dist/` a cada
push na `main` (Settings → Pages → Source: **GitHub Actions**).

**Site:** não usa segredo. A chave do Supabase em `src/lib/cloud.ts` e em `bot/wrangler.toml` é a *publishable*
(feita para ir no navegador); o acesso aos dados é protegido pelo login e pelas regras da tabela. Para ligar o
Telegram por conta, crie a **variável** (Variables, não Secrets) `BOT_URL` com o endereço do bot
(`https://barnabank-bot.<sub>.workers.dev`).

**Bot:** o workflow `.github/workflows/bot.yml` publica o worker `barnabank-bot` na Cloudflare quando algo em `bot/`
muda (ou manualmente, em Actions → Publicar bot do Telegram). Precisa destes secrets do repositório:
`TELEGRAM_TOKEN`, `SYNC_KEY` (16 caracteres ou mais), `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. O passo a
passo está em [bot/README.md](bot/README.md).

**Convivência com o app antigo:** o worker se chama `barnabank-bot`, como o do app antigo, e usa o mesmo KV
(`barnabank-data`). Publicar daqui **substitui o código do bot no ar**; o modo antigo com `SYNC_KEY` continua
funcionando e os dados não mudam. Enquanto o repositório antigo existir, desligue o workflow do bot lá, senão um push
em `bot/` dele sobrescreve o worker novo com o código velho.

## Limites

- Os dados do aparelho são a fonte. Sem internet, tudo fica salvo aqui e sincroniza quando a conexão volta.
- O motor do bot (`bot/engine.js`) é uma cópia congelada das regras do app antigo; mudar uma regra financeira no app
  exige atualizar o motor (veja [bot/ENGINE.md](bot/ENGINE.md)).
- O plano grátis da Cloudflare limita as gravações do KV por dia, somando todas as contas.

O histórico do que foi portado do app antigo, com decisões de redesenho e pontos duvidosos, está em
[MIGRATION.md](MIGRATION.md).
