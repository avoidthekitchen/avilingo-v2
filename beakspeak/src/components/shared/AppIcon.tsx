export type AppIconName = 'learn' | 'quiz' | 'progress' | 'lock'

/** Decorative icons inherit the control's color; its text supplies the label. */
export default function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {name === 'learn' && <>
        <path d="M5 3.5h12a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3v-13a1 1 0 0 1 1-1Z" />
        <path d="M4 17.5a3 3 0 0 1 3-3h12M8 3.5v11M12 11c0-3 1-4 4-4 0 3-1 4-4 4Zm0 0 3-3" />
      </>}
      {name === 'quiz' && <>
        <path d="M3 18h13M5 17c0-4 2-5 4-6 0-3 1.5-5 4-5 2 0 3 1.5 3 3l3 1-3 1c-.5 3-3 5-6 5l-5 1Zm4-6 3 1-3 2M11 16v2" />
        <circle cx="13.5" cy="8.5" r=".65" fill="currentColor" stroke="none" />
        <path d="M20 4c1.5 1.5 2 3 2 5M18 5.5c1 1 1.5 2 1.5 3.5" />
      </>}
      {name === 'progress' && <>
        <path d="M5 21 18 4M9 16c-4 0-6-2-6-5 4 0 6 2 6 5Zm4-5c-1-4 0-7 3-8 1 4 0 7-3 8Zm-2 3c4-2 7-1 9 2-4 2-7 1-9-2Z" />
      </>}
      {name === 'lock' && <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2" />
      </>}
    </svg>
  )
}
