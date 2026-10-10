import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import manifestData from '../../../public/content/manifest.json'
import type { Manifest } from '../../core/types'
import { useAppStore } from '../../store/appStore'
import QuizSession from './QuizSession'
import LeaveSessionDialog from '../shared/LeaveSessionDialog'
import Navigation from '../shared/Navigation'

const { answer } = vi.hoisted(() => ({ answer: { current: () => {} } }))
vi.mock('./ThreeChoiceQuiz', () => ({
  default: ({ onAnswer, onAnswerMarked }: {
    onAnswer: (correct: boolean, responseTimeMs: number, chosenId: string) => void
    onAnswerMarked: (correct: boolean, responseTimeMs: number, chosenId: string) => void
  }) => {
    const id = manifestData.species[0].id
    answer.current = () => onAnswer(true, 1000, id)
    return <button onClick={() => onAnswerMarked(true, 1000, id)}>Mark correct answer</button>
  },
}))
vi.mock('../../core/quiz', () => ({
  buildQuizSession: (_progress: unknown, manifest: Manifest) => manifest.species.slice(0, 2).map(species => ({
    targetSpecies: species, exerciseType: 'three_choice', clip: species.audio_clips.songs[0],
  })),
}))

const initial = useAppStore.getInitialState()
beforeEach(() => useAppStore.setState({ ...initial, manifest: { ...manifestData, confuser_pairs: [] } }))
afterEach(() => { cleanup(); useAppStore.setState(initial) })

function Review() {
  const tab = useAppStore(s => s.activeTab)
  const [running, setRunning] = useState(true)
  return <>
    <main>{tab === 'progress'
      ? <h1>Progress</h1>
      : running ? <QuizSession mode="review" onComplete={() => setRunning(false)} /> : <h1>Quiz</h1>}
    </main>
    <Navigation />
    <LeaveSessionDialog />
  </>
}

it.each([true, false])('honors a confirmed exit racing with auto-save (save succeeds: %s)', async succeeds => {
  let finish!: () => void
  let fail!: (error: Error) => void
  const save = vi.fn(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject }))
  useAppStore.setState({ storage: { ...initial.storage, saveProgress: save } })
  render(<Review />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark correct answer' }))
  act(() => useAppStore.getState().navigateTo('progress'))

  let exiting!: Promise<void>
  // The timer starts the save before React publishes saving=true to the guard.
  act(() => {
    answer.current()
    exiting = useAppStore.getState().confirmSessionExit()
  })
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'End review' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Progress' })).toBeDisabled()
  expect(useAppStore.getState().activeTab).toBe('learn')
  await act(async () => {
    await useAppStore.getState().confirmSessionExit()
    useAppStore.getState().cancelSessionExit()
    useAppStore.getState().navigateTo('credits')
  })
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()

  await act(async () => {
    if (succeeds) finish()
    else fail(new Error('disk full'))
    await exiting
  })
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  if (succeeds) {
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(useAppStore.getState().allProgress.get(manifestData.species[0].id)?.reps).toBe(1)
  } else {
    expect(useAppStore.getState().activeTab).toBe('learn')
    expect(screen.getByRole('alert')).toHaveTextContent('could not be fully saved')
    expect(screen.getByRole('button', { name: '← Quit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Progress' })).toBeEnabled()
    save.mockImplementation(async () => {})
    act(() => useAppStore.getState().navigateTo('progress'))
    await act(async () => { await useAppStore.getState().confirmSessionExit() })
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(2)
  }
})
