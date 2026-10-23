/** rota da carteira, mantendo mês e tipo do detalhe (?m=&t=) */
export function walletHref(id: string, search: string) {
  return '/carteiras/' + encodeURIComponent(id) + (search ? '?' + search : '')
}
