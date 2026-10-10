import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import PhotoAttribution from './PhotoAttribution'

it('shows the supplied creator, exact license, and original file source', () => {
  render(<PhotoAttribution photo={{
    url: '/content/bird-photos/amcr-960.jpg', filename: 'bird.jpg',
    source: 'wikimedia_commons', creator: 'Photographer', license: 'CC BY 2.0',
    license_url: 'https://creativecommons.org/licenses/by/2.0',
    source_url: 'https://commons.wikimedia.org/wiki/File:bird.jpg', wikipedia_page: '',
  }} />)
  expect(screen.getByText('Photo by Photographer')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'CC BY 2.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/2.0')
  expect(screen.getByRole('link', { name: 'Wikimedia Commons source' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:bird.jpg')
  // Credit links point at the Commons file page, never the bundled copy.
  for (const link of screen.getAllByRole('link')) {
    expect(link).not.toHaveAttribute('href', expect.stringContaining('/content/bird-photos/'))
  }
})
