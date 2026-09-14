import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'

// Returns true when the destination has been handed to iOS, so the caller can cancel
// the anchor's own navigation. The launch outcome only arrives after the click handler
// has to make that decision, so a launch that fails or is declined falls back to
// opening the destination the way the web build does.
export function openExternalUrl(url: string): boolean {
  if (!Capacitor.isNativePlatform()) return false

  AppLauncher.openUrl({ url })
    .then(({ completed }) => {
      if (!completed) openInNewTab(url)
    })
    .catch(() => openInNewTab(url))

  return true
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
