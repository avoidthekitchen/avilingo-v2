import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const validator = fileURLToPath(new URL('./validate-runtime-content.mjs', import.meta.url))

test('rejects local species photos that packaging would remove', (t) => {
  const contentBuildDir = mkdtempSync(join(tmpdir(), 'beakspeak-runtime-content-'))
  t.after(() => rmSync(contentBuildDir, { recursive: true, force: true }))
  mkdirSync(join(contentBuildDir, 'audio', 'manual'), { recursive: true })
  writeFileSync(join(contentBuildDir, 'manifest.json'), JSON.stringify({
    species: [{
      photo: { url: '/content/photos/american-crow.jpg' },
      audio_clips: { songs: [], calls: [] },
    }],
  }))

  const result = spawnSync(process.execPath, [validator, contentBuildDir], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(
    result.stderr,
    /Manifest references a local photo that packaging removes: \/content\/photos\/american-crow\.jpg/,
  )
})
