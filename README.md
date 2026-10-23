# BarnaBank — redesign (React)

Nova interface do BarnaBank, feita em paralelo ao app atual. As cinco telas estão redesenhadas —
**Início**, **Pessoas**, **Carteiras**, **Contas** e **Relatórios** — todas **só leitura**. Faltam as ações de
escrita, os campos `budgets`/`goals`/`recurring`/`shares` do armazenamento, PWA, sincronização na nuvem e o
bot do Telegram — veja [MIGRATION.md](MIGRATION.md).

Stack: Vite + React + TypeScript, Tailwind CSS v4, componentes no estilo shadcn/ui
(`src/components/ui`), Recharts, Motion, lucide-react, Inter (via `@fontsource-variable/inter`).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173/BarnaBank/
npm test           # testes da lógica (vitest)
npm run lint       # oxlint
npm run build      # gera dist/
npm run preview    # serve o dist/ em http://localhost:4173/BarnaBank/
```

## De onde vêm os dados

Tudo é **somente leitura**. Ordem:

1. `?dados=demo` / `?dados=vazio` na URL (revisão).
2. **Conta na nuvem** (Supabase), se você entrou pelo ícone de nuvem no topo: o app baixa a linha da sua
   conta na tabela `bb_user_state` — a mesma que o BarnaBank atual sincroniza — e mostra esses dados.
   Só faz `GET`; nunca grava na tabela. Os dados baixados ficam só na memória (somem ao recarregar e são
   baixados de novo). Login próprio: a sessão do app novo fica em `bbweb_session`; a do app antigo
   (`barnabank_sb`) não é lida nem renovada, para não derrubar o login dele. "Sair deste app" só apaga
   `bbweb_session`. Criar conta e recuperar senha continuam no app antigo.
3. O mesmo `localStorage` do BarnaBank atual (`barnabank_debts_v3` e `barnabank_settings_v1`), sem gravar
   nessas chaves. A normalização acontece só na memória (`src/lib/storage.ts`).
4. Sem nada disso → dados de **demonstração** (selo "Demonstração" no topo).

- `localStorage` só é compartilhado na **mesma origem** (mesmo domínio e porta). Em
  `localhost` de desenvolvimento não haverá dados do app publicado, então aparece a
  demonstração.
- Para revisar: `?dados=demo` força a demonstração e `?dados=vazio` força o estado vazio
  (ex.: `http://localhost:5173/BarnaBank/?dados=vazio#/`).
- As únicas chaves que o app novo grava são `bbweb_theme` (tema) e `bbweb_session` (login na nuvem).
- Se o app antigo mudar os dados em outra aba, o app novo relê automaticamente.
- Pessoas guarda filtro e busca na URL (`#/pessoas?f=atrasados&q=ana`), não no `localStorage`.
- Carteiras guarda o mês e o tipo de movimento do detalhe na URL
  (`#/carteiras/<id>?m=2026-09&t=saidas`).
- Relatórios guarda período, mês, gráfico e modo tabela na URL
  (`#/relatorios?p=3m&m=2026-09&g=categorias&ver=tabela`).
- Contas guarda mês, filtro e busca na URL (`#/contas?m=2026-09&f=atrasadas&q=luz`); o detalhe
  é `#/contas/fixa-<id>` (conta fixa) ou `#/contas/cartao-<id>` (fatura do cartão).

## Tema

Escuro por padrão; botão no topo alterna para o claro. Tokens de cor, tipografia e raios
ficam em `src/index.css` (variáveis CSS mapeadas no Tailwind via `@theme`).

## Publicar no GitHub Pages

Repositório: `urlmistas/BarnaBank` → **https://urlmistas.github.io/BarnaBank/**. O `vite.config.ts` usa
`base: '/BarnaBank/'` e as rotas usam `HashRouter` (`/BarnaBank/#/pessoas`), então recarregar não dá 404.
O workflow `.github/workflows/deploy.yml` roda lint, testes e build e publica `dist/` a cada push na `main`
(Settings → Pages → Source: **GitHub Actions**).

O app antigo fica em `urlmistas.github.io/barna-bank/`. Mesma origem (`urlmistas.github.io`), então os dois
enxergam o mesmo `localStorage`: abrir o antigo nesse navegador já deixa os dados à vista no novo, mesmo sem
entrar na conta.

## Estrutura

```
src/
  app/            shell (cabeçalho, abas, barra inferior), tema, contexto de dados
  components/ui/  button, card, badge, skeleton, tabs, segmented, error-boundary (base shadcn/ui)
  lib/
    storage.ts    leitor somente leitura do localStorage + fallback de demonstração
    demo-data.ts  dados fictícios relativos à data de hoje
    finance/      lógica pura portada do app.js antigo, com testes
  pages/          Início, Pessoas, Carteiras, Contas e Relatórios
screenshots/      capturas das cinco telas (desktop 1440 / celular 390, escuro e claro)
```
