export interface Species {
  id: string;
  common_name: string;
  scientific_name: string;
  family: string;
  ebird_frequency_pct: number;
  habitat: string[];
  seasonality: string;
  mnemonic: string;
  sound_types: {
    song: string;
    call: string;
  };
  confuser_species: string[];
  confuser_notes: string;
  audio_clips: {
    songs: AudioClip[];
    calls: AudioClip[];
  };
  photo: Photo;
  wikipedia_audio?: WikipediaAudio[];
}

export interface AudioClip {
  xc_id: string;
  xc_url: string;
  audio_url: string;
  type: string;
  quality: string;
  length: string;
  recordist: string;
  license: string;
  location: string;
  country: string;
  score: number;
}

export interface Photo {
  url: string;
  width?: number;
  height?: number;
  filename: string;
  source: string;
  license: string;
  wikipedia_page: string;
}

export interface WikipediaAudio {
  url: string;
  filename: string;
  source: string;
  license: string;
  commons_page: string;
}

export interface UserProgress {
  speciesId: string;
  introduced: boolean;
  introducedAt?: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  lastReview?: number;
  nextReview?: number;
}

export interface ConfuserPair {
  pair: [string, string];
  label: string;
  difficulty: 'easy' | 'medium' | 'hard';
  key_difference: string;
}

export interface Lesson {
  lesson: number;
  title: string;
  species: string[];
  rationale: string;
}

export type ExerciseType =
  | 'three_choice'
  | 'same_different';

export type Tab = 'learn' | 'quiz' | 'progress' | 'credits';

export interface Manifest {
  version: string;
  tier: number;
  region: string;
  target_species_count: number;
  species: Species[];
  confuser_pairs: ConfuserPair[];
  lesson_plan: {
    description: string;
    lessons: Lesson[];
  };
}

export interface ConfusionEvent {
  targetId: string;
  chosenId: string;
  timestamp: number;
}

export type LessonPhase = 'review' | 'cards' | 'quiz' | 'complete';

export interface IntroQuizItem {
  targetSpecies: Species;
  distractors: Species[];
  clip: AudioClip;
}

export interface ReviewQuizItem {
  targetSpecies: Species;
  distractors: Species[];
  clip: AudioClip;
}

export interface QuizItem {
  targetSpecies: Species;
  exerciseType: ExerciseType;
  distractors: Species[];
  clip: AudioClip;
  secondClip?: AudioClip;
  isSame?: boolean;
}

export interface LessonSession {
  lesson: Lesson;
  phase: LessonPhase;
  cardIndex: number;
  introQuizItems: IntroQuizItem[];
  reviewQuizItems: ReviewQuizItem[];
  quizIndex: number;
  quizResults: boolean[];
}
