import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const validator = fileURLToPath(new URL('./validate-runtime-content.mjs', import.meta.url))

function bundledPhoto(id) {
  return {
    url: `/content/bird-photos/${id}-960.jpg`,
    srcset: `/content/bird-photos/${id}-250.jpg 250w, /content/bird-photos/${id}-960.jpg 960w`,
  }
}

function makeContent(t, { photo = bundledPhoto('amcr'), files = [] } = {}) {
  const contentBuildDir = mkdtempSync(join(tmpdir(), 'beakspeak-runtime-content-'))
  t.after(() => rmSync(contentBuildDir, { recursive: true, force: true }))
  mkdirSync(join(contentBuildDir, 'audio', 'manual'), { recursive: true })
  writeFileSync(join(contentBuildDir, 'manifest.json'), JSON.stringify({
    species: [{
      photo,
      audio_clips: { songs: [{ audio_url: '/content/audio/manual/amcr/song-xc1.ogg' }], calls: [] },
    }],
  }))
  for (const file of ['audio/manual/amcr/song-xc1.ogg', ...files]) {
    mkdirSync(dirname(join(contentBuildDir, file)), { recursive: true })
    writeFileSync(join(contentBuildDir, file), 'data')
  }
  return contentBuildDir
}

function validate(contentBuildDir) {
  return spawnSync(process.execPath, [validator, contentBuildDir], { encoding: 'utf8' })
}

test('accepts bundled photos and audio that exactly match the manifest', (t) => {
  const result = validate(makeContent(t, {
    files: ['bird-photos/amcr-250.jpg', 'bird-photos/amcr-960.jpg'],
  }))

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Validated 1 manifest-referenced production audio clips and 2 bundled photos\./)
})

test('rejects a remote photo url', (t) => {
  const result = validate(makeContent(t, {
    photo: { ...bundledPhoto('amcr'), url: 'https://thumb.wikimedia.org/a/960px-a.jpg' },
  }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Manifest references a photo that is not bundled: https:\/\/thumb\.wikimedia\.org/)
})

test('rejects a remote responsive candidate even when the main url is bundled', (t) => {
  const result = validate(makeContent(t, {
    photo: {
      url: '/content/bird-photos/amcr-960.jpg',
      srcset: 'https://thumb.wikimedia.org/a/250px-a.jpg 250w, /content/bird-photos/amcr-960.jpg 960w',
    },
  }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Manifest references a photo that is not bundled: https:\/\/thumb\.wikimedia\.org\/a\/250px-a\.jpg/)
})

test('rejects manifest references to legacy research photo paths', (t) => {
  const result = validate(makeContent(t, { photo: { url: '/content/photos/amcr.jpg' } }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Manifest references a photo that is not bundled: \/content\/photos\/amcr\.jpg/)
})

test('reports missing and unreferenced bundled photos', (t) => {
  const result = validate(makeContent(t, {
    files: ['bird-photos/amcr-960.jpg', 'bird-photos/stja-960.jpg'],
  }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Runtime photos do not match the manifest/)
  assert.match(result.stderr, /missing: bird-photos\/amcr-250\.jpg/)
  assert.match(result.stderr, /unexpected: bird-photos\/stja-960\.jpg/)
})

test('rejects stray content outside the production set, with legacy-photo guidance', (t) => {
  const result = validate(makeContent(t, {
    files: ['bird-photos/amcr-250.jpg', 'bird-photos/amcr-960.jpg', 'photos/amcr.jpg', 'notes.txt'],
  }))

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Runtime content contains files outside the production set/)
  assert.match(result.stderr, /unexpected: photos\/amcr\.jpg/)
  assert.match(result.stderr, /unexpected: notes\.txt/)
  assert.match(result.stderr, /\.cache\/legacy-photos/)
})
