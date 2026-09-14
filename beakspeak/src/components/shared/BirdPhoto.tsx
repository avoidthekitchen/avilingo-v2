import { useState, type ImgHTMLAttributes } from 'react'
import fallbackPhotoUrl from '../../assets/bird-photo-fallback.svg'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onError'> & {
  src: string
  alt: string
}

export default function BirdPhoto({ src, alt, ...props }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const usesFallback = failedUrl === src

  return (
    <img
      {...props}
      src={usesFallback ? fallbackPhotoUrl : src}
      alt={usesFallback ? `${alt} photo unavailable` : alt}
      data-photo-fallback={usesFallback ? 'true' : undefined}
      onError={() => {
        if (!usesFallback) setFailedUrl(src)
      }}
    />
  )
}
