import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/appStore'
import LeaveSessionDialog from './LeaveSessionDialog'

const initial = useAppStore.getInitialState()
beforeEach(() => useAppStore.setState(initial))
afterEach(() => useAppStore.setState(initial))

it('focuses the completion heading when automatic completion removes the opener', async () => {
  const prompt = { title: 'Leave?', message: 'Progress is lost.', confirmLabel: 'Leave', cancelLabel: 'Stay' }
  useAppStore.getState().setSessionGuard({ prompt, busy: false, exit: vi.fn() })
  const { rerender } = render(<><main><button onClick={() => useAppStore.getState().requestSessionExit()}>Back</button></main><LeaveSessionDialog /></>)
  screen.getByRole('button', { name: 'Back' }).focus()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
  await act(async () => {
    useAppStore.getState().setSessionGuard(null)
    rerender(<><main><h2>Lesson Complete!</h2></main><LeaveSessionDialog /></>)
  })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Lesson Complete!' })).toHaveFocus()
})
