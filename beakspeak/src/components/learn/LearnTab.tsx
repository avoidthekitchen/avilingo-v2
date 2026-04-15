import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { getLessons } from '../../core/manifest'
import { isLessonAvailable, isLessonComplete } from '../../core/lesson'
import { getSpeciesByIds } from '../../core/manifest'
import LearnSession from './LearnSession'
import type { Lesson } from '../../core/types'

export default function LearnTab() {
  const manifest = useAppStore(s => s.manifest)
  const allProgress = useAppStore(s => s.allProgress)
  const getCompletedLessons = useAppStore(s => s.getCompletedLessons)
  const getIntroducedSpecies = useAppStore(s => s.getIntroducedSpecies)
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)

  if (!manifest) return null

  const lessons = getLessons(manifest)
  const completedLessons = getCompletedLessons()
  const introducedCount = getIntroducedSpecies().length

  if (activeLesson) {
    return (
      <LearnSession
        lesson={activeLesson}
        onComplete={() => setActiveLesson(null)}
      />
    )
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">Learn Birds</h1>
        <p className="text-text-muted mt-1">
          {introducedCount} of {manifest.target_species_count} birds learned
        </p>
        <div className="mt-2 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${(introducedCount / manifest.target_species_count) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {lessons.map(lesson => {
          const available = isLessonAvailable(lesson.lesson, completedLessons, allProgress)
          const completed = isLessonComplete(lesson, allProgress)
          const species = getSpeciesByIds(manifest, lesson.species)

          return (
            <button
              key={lesson.lesson}
              onClick={() => available && !completed && setActiveLesson(lesson)}
              disabled={!available || completed}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                completed
                  ? 'bg-success/10 border-success/30'
                  : available
                  ? 'bg-card border-border hover:border-primary cursor-pointer'
                  : 'bg-border/30 border-border/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-text">
                  {completed && '✓ '}
                  Lesson {lesson.lesson}: {lesson.title}
                </h3>
                {!available && !completed && (
                  <span className="text-xs text-text-muted">🔒</span>
                )}
              </div>
              <div className="flex gap-2">
                {species.map(s => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <img
                      src={s.photo.url}
                      alt={s.common_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <span className="text-xs text-text-muted">{s.common_name}</span>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
