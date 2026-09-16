import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.unformedideas.beakspeak',
  appName: 'BeakSpeak',
  webDir: 'dist',
  experimental: {
    ios: {
      spm: {
        // Capacitor emits `.v18` for an iOS 18.x target; that enum requires PackageDescription 6.
        swiftToolsVersion: '6.0',
      },
    },
  },
}

export default config
