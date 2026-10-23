/** rota da pessoa, mantendo filtro e busca da lista (?f=&q=) */
export function personHref(key: string, search: string) {
  return '/pessoas/' + encodeURIComponent(key) + (search ? '?' + search : '')
}
