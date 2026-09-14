import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExternalLink from './ExternalLink'
import { openExternalUrl } from '../../adapters/externalLinks'

vi.mock('../../adapters/externalLinks', () => ({
  openExternalUrl: vi.fn(),
}))

describe('ExternalLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prevents web-view navigation when the native adapter handles the link', () => {
    vi.mocked(openExternalUrl).mockReturnValue(true)
    render(<ExternalLink href="https://xeno-canto.org/123">XC123</ExternalLink>)

    const followed = fireEvent.click(screen.getByRole('link', { name: 'XC123' }))

    expect(followed).toBe(false)
    expect(openExternalUrl).toHaveBeenCalledWith('https://xeno-canto.org/123')
  })
})
