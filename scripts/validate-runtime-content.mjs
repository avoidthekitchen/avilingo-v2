import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const contentBuildDir = resolve(process.argv[2] ?? '')
const manifest = JSON.parse(
  await readFile(join(contentBuildDir, 'manifest.json'), 'utf8'),
)

const expectedFiles = new Set()
for (const species of manifest.species) {
  const clips = [
    ...species.audio_clips.songs,
    ...species.audio_clips.calls,
  ]

  for (const clip of clips) {
    if (!clip.audio_url.startsWith('/content/audio/manual/')) {
      throw new Error(`Manifest references non-production audio: ${clip.audio_url}`)
    }
    expectedFiles.add(clip.audio_url.slice('/content/'.length))
  }
}

async function collectFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(relative(contentBuildDir, entryPath).split(sep).join('/'))
    }
  }
  return files
}

const actualFiles = new Set(await collectFiles(join(contentBuildDir, 'audio', 'manual')))
const missingFiles = [...expectedFiles].filter(file => !actualFiles.has(file))
const unexpectedFiles = [...actualFiles].filter(file => !expectedFiles.has(file))

if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
  const details = [
    ...missingFiles.map(file => `missing: ${file}`),
    ...unexpectedFiles.map(file => `unexpected: ${file}`),
  ]
  throw new Error(`Runtime audio does not match the manifest:\n${details.join('\n')}`)
}

console.log(`Validated ${actualFiles.size} manifest-referenced production audio clips.`)
