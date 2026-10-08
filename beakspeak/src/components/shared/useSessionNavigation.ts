import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

/** Sessions provide their own Back/Quit controls; tab changes must not discard them. */
export function useSessionNavigation(active: boolean) {
  const setSessionActive = useAppStore(s => s.setSessionActive)
  useEffect(() => {
    setSessionActive(active)
    return () => setSessionActive(false)
  }, [active, setSessionActive])
}
