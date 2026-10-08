import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { useAppStore } from '../store/appStore'
import type { StorageAdapter } from '../adapters/storage'
import { StorageLoadError } from '../adapters/storageErrors'
import type { Manifest } from '../core/types'

const initial = useAppStore.getInitialState()
const manifest: Manifest = {
  version: '1', tier: 1, region: 'Test', target_species_count: 0, curation_date: '2026-10-08',
  data_sources: {}, species: [], confuser_pairs: [], lesson_plan: { description: 'Test', lessons: [] },
}
let storage: StorageAdapter

beforeEach(() => {
  storage = {
    getProgress: vi.fn(), saveProgress: vi.fn(), saveProgressBatch: vi.fn(), getAllProgress: vi.fn(),
    getConfusionLog: vi.fn(), logConfusion: vi.fn(), clearAll: vi.fn(),
  }
  useAppStore.setState({ ...initial, manifest, storage })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial)
})

it('directs a learner with newer-schema data to update without offering retry or erase', async () => {
  vi.mocked(storage.getAllProgress).mockRejectedValue(new StorageLoadError('newer-schema', 'Unsupported version'))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('newer version of BeakSpeak')
  expect(screen.getByRole('alert')).toHaveTextContent('Update the app')
  expect(screen.queryByRole('button', { name: 'Retry loading progress' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Erase saved progress/ })).not.toBeInTheDocument()
  expect(storage.clearAll).not.toHaveBeenCalled()
})

it('requires confirmation before erasing corrupt progress, retains failed erasures, and returns to Learn after success', async () => {
  vi.mocked(storage.getAllProgress).mockRejectedValue(new StorageLoadError('corrupt', 'Invalid record'))
  vi.mocked(storage.clearAll).mockRejectedValueOnce(new Error('disk full'))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Erase saved progress and start over' }))
  expect(screen.getByRole('group', { name: 'Erase all saved progress?' })).toHaveTextContent('It cannot be undone')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(storage.clearAll).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Erase saved progress and start over' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, erase saved progress' }))
  expect(await screen.findByText(/Saved progress could not be erased/)).toHaveTextContent('has not been reset')
  fireEvent.click(screen.getByRole('button', { name: 'Yes, erase saved progress' }))
  expect(await screen.findByRole('heading', { name: 'Learn Birds' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each(['unavailable', 'timeout'] as const)('keeps sounds and Credits available for %s failures without offering erasure', async kind => {
  vi.mocked(storage.getAllProgress).mockRejectedValue(new StorageLoadError(kind, 'Unavailable'))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('fully close and reopen BeakSpeak')
  expect(screen.queryByRole('button', { name: /Erase saved progress/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Listen to bird sounds' }))
  expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'About' }))
  expect(screen.getByRole('heading', { name: 'Credits & Attribution' })).toBeInTheDocument()
})
