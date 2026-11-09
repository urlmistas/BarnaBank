import { useEffect, useRef, useState } from 'react'
import { SHAKE_EVENT, accelOf, makeShakeDetector, readShake } from '@/lib/shake'

/** com a opção ligada (Configurações → Visual), sacudir o celular chama `onShake` */
export function useShake(onShake: () => void) {
  const [on, setOn] = useState(() => readShake())
  const cb = useRef(onShake)
  useEffect(() => {
    cb.current = onShake
  })

  useEffect(() => {
    const sync = () => setOn(readShake())
    window.addEventListener(SHAKE_EVENT, sync)
    return () => window.removeEventListener(SHAKE_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!on) return
    const detect = makeShakeDetector()
    const handler = (e: DeviceMotionEvent) => {
      if (detect(accelOf(e))) cb.current()
    }
    window.addEventListener('devicemotion', handler)
    return () => window.removeEventListener('devicemotion', handler)
  }, [on])
}
