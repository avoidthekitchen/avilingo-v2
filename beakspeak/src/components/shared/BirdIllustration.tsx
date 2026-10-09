import listeningBird from '../../assets/illustrations/listening-bird.webp'
import celebratingBird from '../../assets/illustrations/celebrating-bird.webp'

export default function BirdIllustration({ variant = 'listening', className = '' }: {
  variant?: 'listening' | 'celebrating'
  className?: string
}) {
  return <img src={variant === 'celebrating' ? celebratingBird : listeningBird} alt="" aria-hidden="true" width={144} height={144} className={`h-36 w-36 object-contain ${className}`} />
}
