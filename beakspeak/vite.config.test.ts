import { describe, expect, it } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'
import viteConfig from './vite.config'

function configForMode(mode: string): UserConfig {
  if (typeof viteConfig !== 'function') {
    throw new Error('Expected Vite configuration to select settings by mode')
  }

  const environment: ConfigEnv = {
    command: 'build',
    mode,
    isSsrBuild: false,
    isPreview: false,
  }
  const config = viteConfig(environment)
  if (config instanceof Promise) {
    throw new Error('Expected synchronous Vite configuration')
  }
  return config
}

describe('asset base selection', () => {
  it('uses the Cloudflare route for web builds', () => {
    expect(configForMode('web').base).toBe('/beakspeak/')
  })

  it('uses relative assets for native builds', () => {
    expect(configForMode('native').base).toBe('./')
  })
})
