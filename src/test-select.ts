import { fireEvent } from '@testing-library/react'

/** escolhe uma opção da lista própria (components/ui/select) pelo valor dela */
export function choose(box: HTMLElement, value: string) {
  fireEvent.click(box)
  const list = document.getElementById(box.getAttribute('aria-controls') ?? '')
  const opt = list?.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)
  if (!opt) throw new Error(`opção "${value}" não encontrada`)
  fireEvent.click(opt)
}

/** valor escolhido, lido da opção marcada */
export function chosen(box: HTMLElement): string | null {
  fireEvent.click(box)
  const list = document.getElementById(box.getAttribute('aria-controls') ?? '')
  const v = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.dataset.value ?? null
  fireEvent.click(box)
  return v
}
