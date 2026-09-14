import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FeedbackAnnouncement from './FeedbackAnnouncement'

describe('FeedbackAnnouncement', () => {
  it('keeps a persistent status region whose message can be updated', () => {
    const { rerender } = render(<FeedbackAnnouncement message="" />)
    const status = screen.getByRole('status')

    expect(status).toBeEmptyDOMElement()

    rerender(<FeedbackAnnouncement message="Correct!" />)
    expect(status).toHaveTextContent('Correct!')
  })
})
