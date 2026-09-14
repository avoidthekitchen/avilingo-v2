interface Props {
  message: string
}

export default function FeedbackAnnouncement({ message }: Props) {
  return (
    <p aria-live="polite" className="sr-only" role="status">
      {message}
    </p>
  )
}
