import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import type { SessionExitPrompt } from '../../store/appStore'

interface SessionNavigation {
  /** False once the session has ended (results/complete screens), so tabs switch freely. */
  active: boolean
  prompt: SessionExitPrompt
  busy?: boolean
  onExit: () => void
}

/**
 * Session progress lives in component state and is lost when the session unmounts,
 * so leaving one (by tab or by its own Back/Quit) goes through a confirmation.
 * Returns the handler for the session's own exit control.
 */
export function useSessionNavigation({ active, prompt, busy = false, onExit }: SessionNavigation) {
  const setSessionGuard = useAppStore(s => s.setSessionGuard)
  const requestSessionExit = useAppStore(s => s.requestSessionExit)
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

  const { title, message, confirmLabel, cancelLabel } = prompt
  useEffect(() => {
    setSessionGuard(active
      ? { prompt: { title, message, confirmLabel, cancelLabel }, busy, exit: () => onExitRef.current() }
      : null)
  }, [active, busy, title, message, confirmLabel, cancelLabel, setSessionGuard])

  useEffect(() => () => setSessionGuard(null), [setSessionGuard])

  return requestSessionExit
}
