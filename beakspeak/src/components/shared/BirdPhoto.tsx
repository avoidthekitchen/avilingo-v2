import { useState, type ImgHTMLAttributes } from 'react'
import fallbackPhotoUrl from '../../assets/bird-photo-fallback.svg'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onError'> & {
  src: string
  alt: string
}

export default function BirdPhoto({ src, alt, srcSet, sizes = '56px', ...props }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const usesFallback = failedUrl === src

  return (
    <img
      {...props}
      src={usesFallback ? fallbackPhotoUrl : src}
      srcSet={usesFallback ? undefined : srcSet}
      sizes={usesFallback ? undefined : sizes}
      // A decorative photo (alt="") stays decorative on fallback; the visible label
      // next to it already names the bird, so repeating it would double the control's
      // accessible name.
      alt={usesFallback && alt !== '' ? `${alt} photo unavailable` : alt}
      data-photo-fallback={usesFallback ? 'true' : undefined}
      onError={() => {
        if (!usesFallback) setFailedUrl(src)
      }}
    />
  )
}
