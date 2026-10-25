import { fireEvent, screen } from '@testing-library/react'

/** abre o menu "Mais ações" (o primeiro da tela, ou o de `scope`) e devolve os itens */
export async function openActions(scope?: HTMLElement) {
  const root = scope ?? screen
  const btn = scope
    ? (scope.querySelector('button[aria-label="Mais ações"]') as HTMLElement)
    : ((await screen.findAllByRole('button', { name: 'Mais ações' }))[0] as HTMLElement)
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn)
  void root
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

/** escolhe um item do menu "Mais ações" pelo nome */
export async function clickAction(name: RegExp | string) {
  const items = await openActions()
  const it = items.find((i) => (typeof name === 'string' ? i.textContent === name : name.test(i.textContent ?? '')))
  if (!it) throw new Error(`item "${String(name)}" não está no menu: ${items.map((i) => i.textContent).join(', ')}`)
  fireEvent.click(it)
}

/** nomes dos itens do menu "Mais ações" */
export async function actionNames() {
  return (await openActions()).map((i) => i.textContent ?? '')
}
