import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { openExternalUrl } from '../../adapters/externalLinks'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
}

export default function ExternalLink({ href, onClick, children, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return

    if (openExternalUrl(href)) event.preventDefault()
  }

  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
