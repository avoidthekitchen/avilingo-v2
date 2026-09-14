import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Disposable feasibility identifier. Choose the permanent identifier before TestFlight.
  appId: 'com.unformedideas.beakspeak.feasibility',
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
