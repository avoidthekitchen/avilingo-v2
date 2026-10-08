import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BirdPhoto from './BirdPhoto'

describe('BirdPhoto', () => {
  it('shows the shared bundled fallback when the remote photo fails', () => {
    render(
      <BirdPhoto
        src="https://upload.wikimedia.org/bird.jpg"
        alt="American Crow"
        className="bird-photo"
      />,
    )

    const photo = screen.getByRole('img', { name: 'American Crow' })
    fireEvent.error(photo)

    expect(screen.getByRole('img', { name: 'American Crow photo unavailable' })).toBe(photo)
    expect(photo).toHaveAttribute('data-photo-fallback', 'true')
    expect(photo).toHaveAttribute('src', expect.stringMatching(/^(data:image\/svg\+xml|.*bird-photo-fallback)/))
    expect(photo).not.toHaveAttribute('src', 'https://upload.wikimedia.org/bird.jpg')
    expect(photo).toHaveClass('bird-photo')
  })

  it('keeps a decorative photo decorative when it falls back', () => {
    const { container } = render(
      <BirdPhoto src="https://upload.wikimedia.org/bird.jpg" alt="" />,
    )

    const photo = container.querySelector('img')!
    fireEvent.error(photo)

    expect(photo).toHaveAttribute('alt', '')
    expect(photo).toHaveAttribute('data-photo-fallback', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
