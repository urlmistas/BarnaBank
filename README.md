# BarnaBank — redesign (React)

Nova interface do BarnaBank, feita em paralelo ao app atual. Nesta entrega existem o esqueleto
(navegação, temas, leitura dos dados) e o **Início** redesenhado. As abas Pessoas, Carteiras,
Contas e Relatórios são páginas provisórias — veja [MIGRATION.md](MIGRATION.md).

Stack: Vite + React + TypeScript, Tailwind CSS v4, componentes no estilo shadcn/ui
(`src/components/ui`), Recharts, Motion, lucide-react, Inter (via `@fontsource-variable/inter`).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173/barna-bank/
npm test           # testes da lógica (vitest)
npm run lint       # oxlint
npm run build      # gera dist/
npm run preview    # serve o dist/ em http://localhost:4173/barna-bank/
```

## De onde vêm os dados

O app **lê** o mesmo `localStorage` do BarnaBank atual (`barnabank_debts_v3` e
`barnabank_settings_v1`) e **nunca grava** nessas chaves. A normalização dos dados antigos
acontece só na memória (`src/lib/storage.ts`).

- `localStorage` só é compartilhado na **mesma origem** (mesmo domínio e porta). Em
  `localhost` de desenvolvimento não haverá dados do app publicado, então aparece a
  demonstração.
- Sem dados → dados de **demonstração** (selo "Demonstração" no topo). Nada é gravado.
- Para revisar: `?dados=demo` força a demonstração e `?dados=vazio` força o estado vazio
  (ex.: `http://localhost:5173/barna-bank/?dados=vazio#/`).
- A única chave que o app novo grava é `bbweb_theme` (tema claro/escuro).
- Se o app antigo mudar os dados em outra aba, o Início relê automaticamente.

## Tema

Escuro por padrão; botão no topo alterna para o claro. Tokens de cor, tipografia e raios
ficam em `src/index.css` (variáveis CSS mapeadas no Tailwind via `@theme`).

## Publicar no GitHub Pages

O `vite.config.ts` usa `base: '/barna-bank/'` e as rotas usam `HashRouter`
(`/barna-bank/#/pessoas`), então recarregar a página não dá 404.

1. Crie um repositório no GitHub e envie este projeto (`main`).
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` roda lint, testes e build e publica `dist/`.

Atenção: se este app for publicado no **mesmo** caminho do app atual
(`<usuario>.github.io/barna-bank/`), ele **substitui** o antigo. Para testar lado a lado,
publique em outro repositório/caminho e ajuste `base` — mas aí os dados só aparecem se a
origem (`<usuario>.github.io`) for a mesma, o que é o caso para repositórios do mesmo usuário.

## Estrutura

```
src/
  app/            shell (cabeçalho, abas, barra inferior), tema, contexto de dados
  components/ui/  button, card, badge, skeleton (base shadcn/ui)
  lib/
    storage.ts    leitor somente leitura do localStorage + fallback de demonstração
    demo-data.ts  dados fictícios relativos à data de hoje
    finance/      lógica pura portada do app.js antigo, com testes
  pages/          Início e páginas provisórias
screenshots/      capturas do Início (desktop 1440 / celular 390, escuro e claro)
```
