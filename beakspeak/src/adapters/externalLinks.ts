import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

export function openExternalUrl(url: string): boolean {
  if (!Capacitor.isNativePlatform()) return false

  void Browser.open({ url })
  return true
}
