import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BirdPhoto from './BirdPhoto'

describe('BirdPhoto', () => {
  it('shows the shared illustration fallback when a bundled photo fails', () => {
    render(
      <BirdPhoto
        src="/content/bird-photos/amcr-960.jpg"
        alt="American Crow"
        className="bird-photo"
      />,
    )

    const photo = screen.getByRole('img', { name: 'American Crow' })
    fireEvent.error(photo)

    expect(screen.getByRole('img', { name: 'American Crow photo unavailable' })).toBe(photo)
    expect(photo).toHaveAttribute('data-photo-fallback', 'true')
    expect(photo).toHaveAttribute('src', expect.stringMatching(/^(data:image\/svg\+xml|.*bird-photo-fallback)/))
    expect(photo).not.toHaveAttribute('src', '/content/bird-photos/amcr-960.jpg')
    expect(photo).toHaveClass('bird-photo')
  })

  it('keeps a decorative photo decorative when it falls back', () => {
    const { container } = render(
      <BirdPhoto src="/content/bird-photos/amcr-960.jpg" alt="" />,
    )

    const photo = container.querySelector('img')!
    fireEvent.error(photo)

    expect(photo).toHaveAttribute('alt', '')
    expect(photo).toHaveAttribute('data-photo-fallback', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('removes failed responsive candidates so the bundled fallback can load', () => {
    render(<BirdPhoto src="/content/bird-photos/amcr-960.jpg" srcSet="/content/bird-photos/amcr-250.jpg 250w, /content/bird-photos/amcr-960.jpg 960w" alt="American Crow" />)
    const photo = screen.getByRole('img', { name: 'American Crow' })
    expect(photo).toHaveAttribute('srcset')
    fireEvent.error(photo)
    expect(photo).not.toHaveAttribute('srcset')
    expect(photo).toHaveAttribute('src', expect.stringMatching(/^(data:image\/svg\+xml|.*bird-photo-fallback)/))
  })

  it('renders the bundled photo and its responsive candidates unchanged', () => {
    const srcSet = '/content/bird-photos/amcr-250.jpg 250w, /content/bird-photos/amcr-960.jpg 960w'
    render(<BirdPhoto src="/content/bird-photos/amcr-960.jpg" srcSet={srcSet} alt="American Crow" />)

    const photo = screen.getByRole('img', { name: 'American Crow' })
    expect(photo).toHaveAttribute('src', '/content/bird-photos/amcr-960.jpg')
    expect(photo).toHaveAttribute('srcset', srcSet)
    expect(photo).not.toHaveAttribute('data-photo-fallback')
  })
})
