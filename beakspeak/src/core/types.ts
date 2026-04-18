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
  commercial_ok?: boolean;
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

export interface Manifest {
  version: string;
  tier: number;
  region: string;
  target_species_count: number;
  curation_date: string;
  data_sources: Record<string, unknown>;
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

export type ExerciseType = 'three_choice' | 'same_different';

export type Tab = 'learn' | 'quiz' | 'progress' | 'credits';

export interface IntroQuizItem {
  targetSpecies: Species;
  clip: AudioClip;
  choices: Species[];
}

export interface QuizItem {
  targetSpecies: Species;
  exerciseType: ExerciseType;
  clip: AudioClip;
  // For three_choice
  choices?: Species[];
  // For same_different
  secondClip?: AudioClip;
  secondSpecies?: Species;
  isSame?: boolean;
}
