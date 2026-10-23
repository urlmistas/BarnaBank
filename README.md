# BarnaBank Web

**Versão 1.0.0** · [urlmistas.github.io/BarnaBank](https://urlmistas.github.io/BarnaBank/)

Nova interface do BarnaBank (controle de dívidas, contas e carteiras), feita em React e publicada em paralelo ao
[app atual](https://urlmistas.github.io/barna-bank/). A versão 1.0 é **somente leitura**: ela mostra os seus dados
com um visual novo, mas não cria, edita nem apaga nada. Para alterar dados, continue usando o app atual.

## O que tem na 1.0

| Tela | O que mostra |
|---|---|
| **Início** | Resumo do dia, a semana, o que vence e o que está atrasado. |
| **Pessoas** | Lista única com o saldo líquido de cada pessoa (a receber − eu devo), filtros, busca e detalhe com parcelas e histórico. |
| **Carteiras** | Saldo por carteira, extrato do mês, gráfico e detalhe de cartões com a fatura. |
| **Contas** | Contas fixas e faturas de cartão por mês, com filtros, busca e detalhe. |
| **Relatórios** | Período, três medidas, um gráfico por vez (categorias, evolução, comparação) e modo tabela. |
| **Configurações** | Conta na nuvem, tema (sistema, claro, escuro), moeda, formato de data e origem dos dados. |

Também: tema escuro por padrão, layout para celular e desktop, carregamento com *skeletons*, estados de erro e de
dados vazios, e filtros guardados na URL (dá para compartilhar um link com o filtro aplicado).

## De onde vêm os dados e como sincroniza

Os dados **deste aparelho** são sempre a fonte: o app lê e grava no `localStorage` (`barnabank_debts_v3` e
`barnabank_settings_v1`, as mesmas chaves do BarnaBank antigo). A conta e o bot recebem cópias. Ordem de leitura:

1. `?dados=demo` ou `?dados=vazio` na URL (para revisão; nada é gravado nem sincronizado).
2. O `localStorage` deste aparelho.
3. Sem nada disso, **dados de demonstração** (selo "Demonstração" no topo).

Cada gravação preserva os campos que o app ainda não conhece (`budgets`, `goals`, `shares`, `tgLog`…): o JSON atual é
lido, só o que mudou é trocado e o resto volta intacto. O `localStorage` só é compartilhado na mesma origem; em
`localhost` não há os dados do app publicado, e aparece a demonstração.

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

Em **Configurações → Nuvem e bot do Telegram**, informe o endereço do bot e a chave (`SYNC_KEY`). A configuração fica
em `barnabank_cloud`, a mesma chave do app antigo, então quem já tinha configurado não precisa digitar de novo. O bot
aplica sozinho as mensagens do Telegram (ele tem as mesmas regras do app); este app envia os dados do aparelho quando
mudam e adota a versão do bot quando só o bot mudou. A chave só viaja no cabeçalho `Authorization`, nunca na URL, e
não aparece em mensagens de erro.

### O que o app novo grava no navegador

| Chave | Conteúdo |
|---|---|
| `barnabank_debts_v3`, `barnabank_settings_v1` | Os dados (mesmo formato do app antigo). |
| `barnabank_cloud` | Endereço e chave do bot, e o controle da última sincronização. |
| `bbweb_theme` | Tema escolhido. |
| `bbweb_prefs` | Moeda e formato de data escolhidos em Configurações. |
| `bbweb_session` | Sessão do login na nuvem, com `rev` e `synced` da última sincronização. |
| `bbweb_backup_prev` | Cópia dos dados de antes da última vez que a nuvem os substituiu. |

A sessão do app antigo (`barnabank_sb`) não é lida nem renovada, para não derrubar o login dele. "Sair" em
Configurações só apaga `bbweb_session`; os dados continuam no aparelho. Criar conta e recuperar senha continuam no app
antigo.

## Rodar localmente

Requer Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/BarnaBank/
npm test           # testes (vitest): lógica financeira, nuvem, preferências e a tela de Configurações
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
    storage.ts    leitor somente leitura do localStorage + fallback de demonstração
    cloud.ts      login e leitura da conta no Supabase (somente GET)
    prefs.ts      preferências de moeda e data
    demo-data.ts  dados fictícios relativos à data de hoje
    finance/      lógica pura portada do app antigo, com testes
  pages/          Início, Pessoas, Carteiras, Contas, Relatórios e Configurações
screenshots/      capturas das telas (desktop 1440 / celular 390, escuro e claro)
```

Os tokens de cor, tipografia e raios ficam em `src/index.css` (variáveis CSS mapeadas no Tailwind via `@theme`).
As rotas usam `HashRouter` (`/BarnaBank/#/pessoas`), então recarregar a página não dá 404 no GitHub Pages.

## Publicação

O repositório é `urlmistas/BarnaBank` e o site é publicado no GitHub Pages. O `vite.config.ts` usa
`base: '/BarnaBank/'`. O workflow `.github/workflows/deploy.yml` roda lint, testes e build e publica `dist/` a cada
push na `main` (Settings → Pages → Source: **GitHub Actions**).

**Secrets: nenhum.** O deploy não usa segredo algum. A chave do Supabase em `src/lib/cloud.ts` é a chave
*publishable* (feita para ir no navegador, a mesma do app antigo); o acesso aos dados é protegido pelo login e pelas
regras da tabela. Os secrets do app antigo (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SYNC_KEY`,
`TELEGRAM_TOKEN`) servem só ao bot do Telegram e continuam lá; este repositório não tem bot.

## Limites da 1.0

- Não cria, edita nem apaga dados (dívidas, pagamentos, carteiras, contas fixas, cartões).
- Não lê ainda `budgets`, `goals`, `recurring` e `shares`, então não há orçamento do mês nem metas.
- Sem PWA e sem criar conta nem recuperar senha (continuam no app antigo).
- Não há linha de grupo em Pessoas: dívidas de grupo entram na linha da pessoa.

O mapa do que falta portar, com as linhas de referência no app antigo, está em [MIGRATION.md](MIGRATION.md).
