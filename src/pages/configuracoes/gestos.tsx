import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { readTabSwipe, writeTabSwipe } from '@/lib/gestures'
import { SHAKE_EVENT, askShakePermission, readShake, shakeSupported, writeShake } from '@/lib/shake'
import { isStandalone } from '@/lib/pwa/install'
import { Row, Section, Switch } from './layout'

/** Gestos do celular: deslizar entre abas e sacudir para esconder os valores */
export function GesturesSection() {
  const toast = useToast()
  const [tabs, setTabs] = useState(() => readTabSwipe())
  const [shake, setShake] = useState(() => readShake())
  const standalone = isStandalone()

  useEffect(() => {
    const sync = () => setShake(readShake())
    window.addEventListener(SHAKE_EVENT, sync)
    return () => window.removeEventListener(SHAKE_EVENT, sync)
  }, [])

  async function toggleShake(on: boolean) {
    if (on && !(await askShakePermission())) {
      toast.show('Sem permissão para o sensor de movimento. No iPhone, permita quando o aparelho perguntar.')
      return
    }
    writeShake(on)
    setShake(on)
  }

  return (
    <Section title="Gestos" hint="Para o celular. Arrastar da borda esquerda para voltar e puxar para baixo para atualizar funcionam no app instalado.">
      <Row
        label="Deslizar entre as abas"
        hint={standalone ? 'Arraste para o lado no meio da tela para ir à aba vizinha do menu.' : 'Vale no app instalado na tela inicial.'}
      >
        <Switch
          label="Deslizar entre as abas"
          checked={tabs}
          onChange={(on) => {
            writeTabSwipe(on)
            setTabs(on)
          }}
        />
      </Row>
      {shakeSupported() && (
        <Row label="Sacudir para esconder os valores" hint="Sacuda o celular para esconder ou mostrar os valores em dinheiro, como o olhinho do topo.">
          <Switch label="Sacudir para esconder os valores" checked={shake} onChange={(on) => void toggleShake(on)} />
        </Row>
      )}
    </Section>
  )
}
