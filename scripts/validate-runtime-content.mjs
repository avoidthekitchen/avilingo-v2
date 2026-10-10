import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const contentBuildDir = resolve(process.argv[2] ?? '')
const manifest = JSON.parse(
  await readFile(join(contentBuildDir, 'manifest.json'), 'utf8'),
)

const PHOTO_PREFIX = '/content/bird-photos/'
const AUDIO_PREFIX = '/content/audio/manual/'

const expectedAudio = new Set()
const expectedPhotos = new Set()
for (const species of manifest.species) {
  const photoUrls = [
    species.photo.url,
    ...(species.photo.srcset ?? '').split(',').map(candidate => candidate.trim().split(/\s+/)[0]).filter(Boolean),
  ]
  for (const url of photoUrls) {
    if (!url.startsWith(PHOTO_PREFIX)) {
      throw new Error(`Manifest references a photo that is not bundled: ${url}`)
    }
    expectedPhotos.add(url.slice('/content/'.length))
  }

  const clips = [
    ...species.audio_clips.songs,
    ...species.audio_clips.calls,
  ]

  for (const clip of clips) {
    if (!clip.audio_url.startsWith(AUDIO_PREFIX)) {
      throw new Error(`Manifest references non-production audio: ${clip.audio_url}`)
    }
    expectedAudio.add(clip.audio_url.slice('/content/'.length))
  }
}

async function collectFiles(directory) {
  const files = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(relative(contentBuildDir, entryPath).split(sep).join('/'))
    }
  }
  return files
}

function compare(description, expectedFiles, actualFiles) {
  const details = [
    ...[...expectedFiles].filter(file => !actualFiles.has(file)).map(file => `missing: ${file}`),
    ...[...actualFiles].filter(file => !expectedFiles.has(file)).map(file => `unexpected: ${file}`),
  ]
  if (details.length > 0) {
    throw new Error(`${description} the manifest:\n${details.join('\n')}`)
  }
}

// Anything outside the manifest, production audio and bundled photos would ship
// unchecked, e.g. a stale public/content/photos/ from the legacy research pipeline.
const strayFiles = (await collectFiles(contentBuildDir)).filter(file =>
  file !== 'manifest.json' && !file.startsWith('audio/manual/') && !file.startsWith('bird-photos/'))
if (strayFiles.length > 0) {
  const details = strayFiles.map(file => `unexpected: ${file}`)
  if (strayFiles.some(file => file.startsWith('photos/'))) {
    details.push('Legacy research photos belong in .cache/legacy-photos/: run '
      + '`mkdir -p .cache && mv beakspeak/public/content/photos .cache/legacy-photos` from the repo root.')
  }
  throw new Error(`Runtime content contains files outside the production set:\n${details.join('\n')}`)
}

const actualAudio = new Set(await collectFiles(join(contentBuildDir, 'audio', 'manual')))
const actualPhotos = new Set(await collectFiles(join(contentBuildDir, 'bird-photos')))
compare('Runtime audio does not match', expectedAudio, actualAudio)
compare('Runtime photos do not match', expectedPhotos, actualPhotos)

console.log(
  `Validated ${actualAudio.size} manifest-referenced production audio clips and ${actualPhotos.size} bundled photos.`,
)
