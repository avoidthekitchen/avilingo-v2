import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'

export function openExternalUrl(url: string): boolean {
  if (!Capacitor.isNativePlatform()) return false

  void AppLauncher.openUrl({ url })
  return true
}
