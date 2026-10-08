import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import PhotoAttribution from './PhotoAttribution'

it('shows the supplied creator, exact license, and original file source', () => {
  render(<PhotoAttribution photo={{
    url: 'https://thumb.wikimedia.org/bird.jpg', filename: 'bird.jpg',
    source: 'wikimedia_commons', creator: 'Photographer', license: 'CC BY 2.0',
    license_url: 'https://creativecommons.org/licenses/by/2.0',
    source_url: 'https://commons.wikimedia.org/wiki/File:bird.jpg', wikipedia_page: '',
  }} />)
  expect(screen.getByText('Photo by Photographer')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'CC BY 2.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/2.0')
  expect(screen.getByRole('link', { name: 'Wikimedia Commons source' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:bird.jpg')
})
