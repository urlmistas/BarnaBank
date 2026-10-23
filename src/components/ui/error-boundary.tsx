import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Isola falhas de um trecho (ex.: gráfico que não carregou): mostra `fallback` em vez de derrubar a página. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('Falha ao montar o trecho:', error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
