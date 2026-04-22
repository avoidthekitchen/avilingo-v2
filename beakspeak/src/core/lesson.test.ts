import { describe, it, expect } from 'vitest'
import { getNextLesson, isLessonAvailable, isLessonComplete, buildIntroQuiz, buildReviewQuiz } from './lesson'
import type { Lesson, Species, UserProgress } from './types'

function makeLesson(num: number, speciesIds: string[]): Lesson {
  return { lesson: num, title: `Lesson ${num}`, species: speciesIds, rationale: 'test' }
}

function makeSpecies(id: string): Species {
  return {
    id,
    common_name: id.toUpperCase(),
    scientific_name: `Genus ${id}`,
    family: 'TestFamily',
    ebird_frequency_pct: 50,
    habitat: ['backyard'],
    seasonality: 'year-round',
    mnemonic: `mnemonic for ${id}`,
    sound_types: { song: 'test song', call: 'test call' },
    confuser_species: [],
    confuser_notes: '',
    audio_clips: {
      songs: [
        { xc_id: '1', xc_url: '', audio_url: '/a.ogg', type: 'song', quality: 'A', length: '0:10', recordist: 'test', license: 'CC', location: '', country: '', score: 10 },
      ],
      calls: [],
    },
    photo: { url: '/test.jpg', filename: 'test.jpg', source: 'test', license: 'CC', wikipedia_page: '' },
  }
}

function makeProgress(speciesId: string, overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    speciesId,
    introduced: false,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    ...overrides,
  }
}

const lessons = [
  makeLesson(1, ['a', 'b', 'c']),
  makeLesson(2, ['d', 'e', 'f']),
  makeLesson(3, ['g', 'h', 'i']),
]

describe('isLessonAvailable', () => {
  it('lesson 1 is always available when no birds are relearning', () => {
    expect(isLessonAvailable(1, [], new Map())).toBe(true)
  })

  it('lesson 2 requires lesson 1 complete', () => {
    expect(isLessonAvailable(2, [], new Map())).toBe(false)
    expect(isLessonAvailable(2, [1], new Map())).toBe(true)
  })

  it('blocks lessons when birds are in relearning state', () => {
    const progress = new Map([
      ['x', makeProgress('x', { state: 'relearning', introduced: true })],
    ])
    expect(isLessonAvailable(2, [1], progress)).toBe(false)
  })
})

describe('isLessonComplete', () => {
  it('returns true when all 3 species are introduced', () => {
    const progress = new Map([
      ['a', makeProgress('a', { introduced: true })],
      ['b', makeProgress('b', { introduced: true })],
      ['c', makeProgress('c', { introduced: true })],
    ])
    expect(isLessonComplete(lessons[0], progress)).toBe(true)
  })

  it('returns false when some species not introduced', () => {
    const progress = new Map([
      ['a', makeProgress('a', { introduced: true })],
    ])
    expect(isLessonComplete(lessons[0], progress)).toBe(false)
  })
})

describe('getNextLesson', () => {
  it('returns lesson 1 when nothing completed', () => {
    const result = getNextLesson(lessons, [])
    expect(result?.lesson).toBe(1)
  })

  it('returns lesson 2 when lesson 1 completed', () => {
    const result = getNextLesson(lessons, [1])
    expect(result?.lesson).toBe(2)
  })

  it('returns null when all lessons completed', () => {
    const result = getNextLesson(lessons, [1, 2, 3])
    expect(result).toBeNull()
  })
})

describe('buildIntroQuiz', () => {
  const lessonSpecies = ['a', 'b', 'c'].map(makeSpecies)

  it('generates quiz items for the lesson species', () => {
    const items = buildIntroQuiz(lessonSpecies, [])
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.length).toBeLessThanOrEqual(5)
    items.forEach(item => {
      expect(lessonSpecies.map(s => s.id)).toContain(item.targetSpecies.id)
      expect(item.choices.length).toBe(3)
    })
  })

  it('uses previously introduced species as distractors when available', () => {
    const previouslyIntroduced = ['x', 'y', 'z'].map(makeSpecies)
    const items = buildIntroQuiz(lessonSpecies, previouslyIntroduced)
    items.forEach(item => {
      // Correct answer must be in choices
      expect(item.choices.map(c => c.id)).toContain(item.targetSpecies.id)
      // Distractors should be from lesson or previously introduced
      const allIds = [...lessonSpecies, ...previouslyIntroduced].map(s => s.id)
      item.choices.forEach(c => {
        expect(allIds).toContain(c.id)
      })
    })
  })

  it('keeps at least two current-lesson birds in each set of choices', () => {
    const previouslyIntroduced = ['x', 'y', 'z', 'w'].map(makeSpecies)
    const items = buildIntroQuiz(lessonSpecies, previouslyIntroduced)

    items.forEach(item => {
      const lessonChoiceCount = item.choices.filter(choice =>
        lessonSpecies.some(species => species.id === choice.id),
      ).length

      expect(lessonChoiceCount).toBeGreaterThanOrEqual(2)
    })
  })

  it('never returns duplicate choices', () => {
    const previouslyIntroduced = ['x', 'y', 'z', 'w'].map(makeSpecies)
    const items = buildIntroQuiz(lessonSpecies, previouslyIntroduced)

    items.forEach(item => {
      expect(new Set(item.choices.map(choice => choice.id)).size).toBe(item.choices.length)
    })
  })
})

describe('buildReviewQuiz', () => {
  it('returns empty for no introduced species', () => {
    expect(buildReviewQuiz([])).toEqual([])
  })

  it('returns 2-3 items when enough species are introduced', () => {
    const introduced = ['a', 'b', 'c', 'd', 'e'].map(makeSpecies)
    const items = buildReviewQuiz(introduced)
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.length).toBeLessThanOrEqual(3)
  })

  it('never returns duplicate choices', () => {
    const introduced = ['a', 'b', 'c', 'd', 'e'].map(makeSpecies)
    const items = buildReviewQuiz(introduced)

    items.forEach(item => {
      expect(new Set(item.choices.map(choice => choice.id)).size).toBe(item.choices.length)
    })
  })
})
