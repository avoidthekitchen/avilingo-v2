import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Contract test for the shipped runtime manifest. `manual_audio.py --check` and
// validate-runtime-content.mjs cover the audio files on disk; this covers the
// structural assumptions the learning domain makes about lessons, clips, credits,
// and confuser pairs, so a content edit cannot silently break a quiz.
const manifest = JSON.parse(
  readFileSync(new URL('../beakspeak/public/content/manifest.json', import.meta.url), 'utf8'),
)

const allClips = manifest.species.flatMap(species => [
  ...species.audio_clips.songs,
  ...species.audio_clips.calls,
])

test('species ids are unique and match the target species count', () => {
  const ids = manifest.species.map(species => species.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.length, manifest.target_species_count)
})

test('every species belongs to exactly one consecutively numbered lesson', () => {
  const lessons = manifest.lesson_plan.lessons
  assert.deepEqual(lessons.map(lesson => lesson.lesson), lessons.map((_, index) => index + 1))

  const lessonSpecies = lessons.flatMap(lesson => lesson.species)
  assert.equal(new Set(lessonSpecies).size, lessonSpecies.length)
  assert.deepEqual([...lessonSpecies].sort(), manifest.species.map(species => species.id).sort())
})

test('every species has at least one song and one call', () => {
  for (const species of manifest.species) {
    assert.ok(species.audio_clips.songs.length > 0, `${species.id} has no song`)
    assert.ok(species.audio_clips.calls.length > 0, `${species.id} has no call`)
  }
})

// Known defect, kept visible as a todo: SameDifferent decides whether clip 1 was a
// call with `clip.type.includes('call')` instead of using the song/call role. Four
// clips disagree with their role (American Crow song XC531008 and Steller's Jay song
// XC178944 are typed "call", Chestnut-backed Chickadee song XC702313 is "call, song",
// Black-capped Chickadee call XC636533 is "song"), so a Same question for those birds
// plays the identical clip twice. Remove `todo` once the quiz logic keys off the role
// or the data is relabelled.
test('song clips are not typed as calls and call clips are', { todo: 'four clips are typed against their song/call role' }, () => {
  for (const species of manifest.species) {
    for (const clip of species.audio_clips.songs) {
      assert.ok(!clip.type.includes('call'), `${species.id} song ${clip.xc_id} is typed "${clip.type}"`)
    }
    for (const clip of species.audio_clips.calls) {
      assert.ok(clip.type.includes('call'), `${species.id} call ${clip.xc_id} is typed "${clip.type}"`)
    }
  }
})

test('clips reference only production audio with unique Xeno-canto ids', () => {
  const xcIds = allClips.map(clip => clip.xc_id)
  assert.equal(new Set(xcIds).size, xcIds.length)
  for (const clip of allClips) {
    assert.match(clip.audio_url, /^\/content\/audio\/manual\/[a-z]+\/(song|call)-xc\d+\.ogg$/, clip.xc_id)
    assert.ok(clip.audio_url.endsWith(`xc${clip.xc_id}.ogg`), `${clip.audio_url} does not match ${clip.xc_id}`)
  }
})

test('clips and photos carry the attribution the Credits page renders', () => {
  for (const clip of allClips) {
    assert.notEqual(clip.recordist, '', `${clip.xc_id} has no recordist`)
    assert.equal(clip.xc_url, `https://xeno-canto.org/${clip.xc_id}`)
    assert.match(clip.license, /^https:\/\/creativecommons\.org\//, clip.xc_id)
  }
  for (const species of manifest.species) {
    assert.match(species.photo.url, /^https:\/\//, species.id)
    assert.match(species.photo.wikipedia_page, /^https:\/\//, species.id)
    assert.notEqual(species.photo.license, '', `${species.id} photo has no licence`)
  }
})

test('confuser pairs join two distinct species that exist in the manifest', () => {
  const ids = new Set(manifest.species.map(species => species.id))
  for (const pair of manifest.confuser_pairs) {
    assert.notEqual(pair.pair[0], pair.pair[1], pair.label)
    assert.ok(ids.has(pair.pair[0]) && ids.has(pair.pair[1]), `${pair.label} references an unknown species`)
  }
})

test('every species has the learner-facing copy the cards and quizzes render', () => {
  for (const species of manifest.species) {
    for (const field of ['common_name', 'scientific_name', 'mnemonic']) {
      assert.notEqual(species[field], '', `${species.id} has an empty ${field}`)
    }
    assert.ok(species.habitat.length > 0, `${species.id} has no habitat tags`)
  }
})
