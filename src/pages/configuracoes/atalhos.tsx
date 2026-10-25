import { Fragment, useState } from 'react'
import { SHORTCUTS, readShortcutsOn, writeShortcutsOn, type ShortcutInfo } from '@/lib/shortcuts'
import { Kbd, Row, Section, Switch } from './layout'

// Atalhos de teclado: liga/desliga os de uma tecla e mostra a lista (a mesma que o teclado usa, em lib/shortcuts.ts).

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

function Keys({ keys, alt }: { keys: string[]; alt?: string[] }) {
  const show = (k: string) => (k === 'Ctrl' && isMac ? '⌘' : k)
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {keys.map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-xs text-fg-subtle">{keys[0] === 'Ctrl' ? '+' : 'depois'}</span>}
          <Kbd>{show(k)}</Kbd>
        </Fragment>
      ))}
      {alt && (
        <>
          <span className="text-xs text-fg-subtle">ou</span>
          {alt.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </>
      )}
    </span>
  )
}

function List({ items }: { items: ShortcutInfo[] }) {
  return (
    <>
      {items.map((s) => (
        <Row key={s.id} label={s.label}>
          <Keys keys={s.keys} alt={s.alt} />
        </Row>
      ))}
    </>
  )
}

export function ShortcutsSection() {
  const [on, setOn] = useState(readShortcutsOn)
  const geral = SHORTCUTS.filter((s) => s.group === 'geral')
  const ir = SHORTCUTS.filter((s) => s.group === 'ir')
  return (
    <>
      <Section title="Teclado">
        <Row
          label="Atalhos de uma tecla"
          hint={on ? 'Ligados. Não valem enquanto você digita em um campo.' : 'Desligados. Só a busca (Ctrl/⌘ + K ou /) continua funcionando.'}
        >
          <Switch
            label="Atalhos de uma tecla"
            checked={on}
            onChange={(v) => {
              setOn(v)
              writeShortcutsOn(v)
            }}
          />
        </Row>
      </Section>
      <Section title="Geral">
        <List items={geral} />
      </Section>
      <Section title="Ir para uma tela" hint="Aperte G, solte e aperte a letra.">
        <List items={ir} />
      </Section>
    </>
  )
}
