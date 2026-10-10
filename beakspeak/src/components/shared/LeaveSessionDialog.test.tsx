import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/appStore'
import LeaveSessionDialog from './LeaveSessionDialog'

const initial = useAppStore.getInitialState()
const prompt = { title: 'Leave?', message: 'Progress is lost.', confirmLabel: 'Leave', cancelLabel: 'Stay' }
beforeEach(() => useAppStore.setState(initial))
afterEach(() => { cleanup(); useAppStore.setState(initial) })

it('focuses the completion heading when automatic completion removes the opener', async () => {
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

it('focuses the completion heading when the opener never received focus', async () => {
  useAppStore.getState().setSessionGuard({ prompt, busy: false, exit: vi.fn() })
  const { rerender } = render(<><main><h2>Lesson Complete!</h2><button onClick={() => useAppStore.getState().requestSessionExit()}>Back</button></main><LeaveSessionDialog /></>)
  const heading = screen.getByRole('heading', { name: 'Lesson Complete!' })
  const focus = vi.spyOn(heading, 'focus')
  expect(document.activeElement).toBe(document.body)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  await act(async () => {
    useAppStore.getState().setSessionGuard(null)
    rerender(<><main><h2>Lesson Complete!</h2></main><LeaveSessionDialog /></>)
  })
  expect(heading).toHaveFocus()
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
})

it.each(['button', 'backdrop', 'Escape'] as const)('does not focus or change the bird heading on %s cancellation without an opener', async dismiss => {
  const exit = vi.fn()
  useAppStore.getState().setSessionGuard({ prompt, busy: false, exit })
  render(<><main><h2>American Crow</h2><button onClick={() => useAppStore.getState().requestSessionExit()}>Back</button></main><LeaveSessionDialog /></>)
  expect(document.activeElement).toBe(document.body)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
  await act(async () => {
    if (dismiss === 'button') fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    else if (dismiss === 'backdrop') fireEvent.click(screen.getByTestId('leave-session-backdrop'))
    else fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
  })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  const heading = screen.getByRole('heading', { name: 'American Crow' })
  expect(heading).not.toHaveFocus()
  expect(heading).not.toHaveAttribute('tabindex')
  expect(useAppStore.getState().sessionGuard).not.toBeNull()
  expect(exit).not.toHaveBeenCalled()
})

it('returns focus inside the dialog when an automatic save finishes', () => {
  useAppStore.getState().setSessionGuard({ prompt, busy: false, exit: vi.fn() })
  render(<LeaveSessionDialog />)
  act(() => useAppStore.getState().requestSessionExit())
  act(() => useAppStore.getState().setSessionGuard({ prompt, busy: true, exit: vi.fn() }))
  expect(screen.getByRole('alertdialog')).toHaveFocus()
  act(() => useAppStore.getState().setSessionGuard({ prompt, busy: false, exit: vi.fn() }))
  expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
  // The trap must also handle focus on the container itself.
  screen.getByRole('alertdialog').focus()
  expect(fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Tab', shiftKey: true })).toBe(false)
  expect(screen.getByRole('button', { name: 'Leave' })).toHaveFocus()
  screen.getByRole('alertdialog').focus()
  expect(fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Tab' })).toBe(false)
  expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
})

it('cancels on the backdrop and restores the opener without exiting', async () => {
  const exit = vi.fn()
  useAppStore.getState().setSessionGuard({ prompt, busy: false, exit })
  render(<><button onClick={() => useAppStore.getState().requestSessionExit()}>Back</button><LeaveSessionDialog /></>)
  const back = screen.getByRole('button', { name: 'Back' })
  back.focus()
  const focus = vi.spyOn(back, 'focus')
  fireEvent.click(back)
  fireEvent.click(screen.getByText('Progress is lost.'))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByTestId('leave-session-backdrop')))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(back).toHaveFocus()
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(exit).not.toHaveBeenCalled()
})
