# Language Switcher — Design Spec

**Date:** 2026-04-12  
**Status:** Approved  

---

## Overview

Add an English / Hindi language toggle to the dashboard sidebar. When a user switches language, all UI shell text (navigation, labels, headings, status messages, motivational copy) renders in the selected language. Database content (subject names, chapter titles, quiz questions) is never translated — only app-owned strings change.

---

## Scope

**In scope:**
- Navigation labels (sidebar + mobile bottom nav)
- Page headings and subtitles
- Stats labels, status pills, motivational messages
- Button text and empty-state messages
- Quiz analytics labels on the Progress page

**Out of scope:**
- Chapter titles, subject names, video titles, quiz questions (database content)
- Admin panel
- Auth pages (login, signup)

---

## Data Layer

### Supabase migration

Add a `ui_language` column to the `profiles` table:

```sql
ALTER TABLE profiles
ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'
CHECK (ui_language IN ('en', 'hi'));
```

### Cookie

When the user changes language, a `ui_language` cookie is written alongside the Supabase update. This cookie is the authoritative source for server components (which cannot read React context). Cookie: `ui_language`, value `en` or `hi`, path `/`, max-age 1 year, `sameSite: lax`.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/lib/i18n.ts` | Full translation dictionary (`en` + `hi`), `t(lang, key, vars?)` function, `getServerLang()` cookie reader |
| `src/context/language-context.tsx` | `LanguageProvider` + `useLanguage()` hook |
| `src/lib/actions/language.ts` | Server action: update `profiles.ui_language` + set cookie |

### Modified files

| File | Change |
|------|--------|
| `src/app/(dashboard)/layout.tsx` | Fetch `ui_language` from profile; wrap children in `LanguageProvider` |
| `src/components/dashboard/sidebar.tsx` | Add `EN \| हि` toggle button in sidebar footer |
| `src/components/dashboard/welcome-hero.tsx` | Replace all hardcoded strings with `t(key)` |
| `src/components/dashboard/stats-overview.tsx` | Replace all hardcoded strings with `t(key)` |
| `src/components/dashboard/continue-watching.tsx` | Replace section title and `% watched` |
| `src/components/dashboard/recommended-lessons.tsx` | Replace section title |
| `src/components/dashboard/subject-grid.tsx` | Replace labels |
| `src/components/dashboard/header.tsx` | Accept translated title/subtitle as props (no change to interface — callers pass translated strings) |
| `src/app/(dashboard)/dashboard/subjects/page.tsx` | Call `getServerLang()`, pass translated `title`/`subtitle` to `Header` |
| `src/app/(dashboard)/dashboard/progress/page.tsx` | Call `getServerLang()`, pass translated strings to JSX |
| `src/app/(dashboard)/dashboard/quizzes/page.tsx` | Call `getServerLang()`, pass translated strings |
| `src/app/(dashboard)/dashboard/quizzes/[subjectId]/page.tsx` | Same |
| `src/app/(dashboard)/dashboard/chapters/[id]/page.tsx` | Same |
| `src/app/(dashboard)/dashboard/watch/[id]/page.tsx` | Same |

---

## Language Context

```ts
// src/context/language-context.tsx
type Lang = 'en' | 'hi'

interface LanguageContextValue {
  lang: Lang
  t: (key: string, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void  // optimistic update + server action
}
```

`LanguageProvider` receives `initialLang: Lang` as a prop (from the server layout), stores it in `useState`, and exposes `setLang` which:
1. Optimistically updates local state (instant re-render)
2. Calls the `updateLanguage(lang)` server action in the background

---

## Translation System

```ts
// src/lib/i18n.ts
export type Lang = 'en' | 'hi'

const dict = {
  en: { ... },
  hi: { ... },
} satisfies Record<Lang, Record<string, string>>

// Supports {var} interpolation
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string

// Reads ui_language cookie server-side
export async function getServerLang(): Promise<Lang>
```

Variables use `{varName}` syntax: `t(lang, 'hero.chapters', { done: 3, total: 10 })` → `"3/10 chapters"` or `"3/10 अध्याय"`.

---

## Sidebar Toggle UI

Placed in the sidebar footer between the user name block and the Sign Out button. Renders as a small segmented pill:

```
[ EN  |  हि ]
```

- Active language is filled (orange background, white text)
- Inactive is ghost (muted text)
- In collapsed sidebar mode (desktop): shows only the active language code (`EN` or `हि`) as an icon-sized button — clicking cycles to the other language
- On mobile: visible inside the slide-in sidebar drawer (same footer position)

---

## Translation Dictionary (complete)

### Navigation
| Key | en | hi |
|-----|----|----|
| `nav.home` | Home | होम |
| `nav.subjects` | Subjects | विषय |
| `nav.quiz` | Quiz | क्विज़ |
| `nav.progress` | My Progress | मेरी प्रगति |
| `nav.students` | My Students | मेरे छात्र |
| `nav.signOut` | Sign Out | लॉग आउट |
| `nav.language` | Language | भाषा |

### Greetings
| Key | en | hi |
|-----|----|----|
| `greeting.morning` | Good morning | सुप्रभात |
| `greeting.afternoon` | Good afternoon | नमस्ते |
| `greeting.evening` | Good evening | शुभ संध्या |
| `greeting.night` | Good night | शुभ रात्रि |
| `greeting.midnight` | Burning the midnight oil | रात को पढ़ रहे हो? |

### Motivational messages
| Key | en | hi |
|-----|----|----|
| `msg.noChapters` | Pick your first chapter and start the adventure. | पहला अध्याय शुरू करो और सफ़र की शुरुआत करो। |
| `msg.noProgress` | Your first chapter is waiting. One small step today. | पहला अध्याय इंतज़ार कर रहा है। आज एक कदम बढ़ाओ। |
| `msg.fireStreak` | {n}-day streak — you're on fire. Keep it burning. | {n} दिन की लकीर — कमाल कर रहे हो! जारी रखो। |
| `msg.goodStreak` | You've shown up {n} days running. That's the stuff. | {n} दिन से आ रहे हो — यही तो असली मेहनत है। |
| `msg.nearlyDone` | You're nearly there. Finish strong. | लगभग पहुँच गए — ज़ोर लगाओ! |
| `msg.halfway` | Halfway through — the best part is next. | आधा हो गया — आगे और मज़ेदार है। |
| `msg.keepGoing` | Every minute on a chapter compounds. Let's stack another one. | हर मिनट मायने रखता है। एक और अध्याय करो। |

### Welcome Hero
| Key | en | hi |
|-----|----|----|
| `hero.streak` | {n}-day streak | {n} दिन की लकीर |
| `hero.startStreak` | Start a streak | आज से शुरुआत करो |
| `hero.chapters` | {done}/{total} chapters | {done}/{total} अध्याय |
| `hero.noChapters` | No chapters yet | अभी कोई अध्याय नहीं |
| `hero.complete` | {pct}% complete | {pct}% पूर्ण |
| `hero.courseProgress` | Course progress | कोर्स की प्रगति |
| `hero.chaptersToGo` | {n} chapters to go | {n} अध्याय बाकी |
| `hero.allDone` | All chapters wrapped — legend. | सारे अध्याय पूरे — शाबाश! |

### Stats Overview
| Key | en | hi |
|-----|----|----|
| `stats.overall` | Overall | कुल |
| `stats.chaptersDone` | chapters done | अध्याय पूरे |
| `stats.watchTime` | Watch Time | देखने का समय |
| `stats.total` | total | कुल |
| `stats.onARoll` | On a roll | शानदार चल रहे हो! |
| `stats.streak` | Streak | लकीर |
| `stats.streakDays` | {n} days | {n} दिन |
| `stats.streakDay` | 1 day | 1 दिन |
| `stats.keepRhythm` | Keep the learning rhythm going. | सीखते रहो, रुको नहीं। |
| `stats.startStreak` | Start one lesson today to begin your streak. | आज एक पाठ पूरा करो और शुरुआत करो। |
| `stats.subjects` | Subjects | विषय |
| `stats.inProgress` | in progress | जारी है |

### Continue Watching
| Key | en | hi |
|-----|----|----|
| `cw.title` | Continue Watching | जारी रखें |
| `cw.watched` | {pct}% watched | {pct}% देखा |

### Recommended
| Key | en | hi |
|-----|----|----|
| `rec.title` | Recommended | सुझाए गए पाठ |

### Subjects
| Key | en | hi |
|-----|----|----|
| `subjects.title` | Your Subjects | आपके विषय |
| `subjects.subtitle` | {n} subjects available in your learning path | {n} विषय उपलब्ध हैं |
| `subjects.empty` | No subjects are available for your current class yet. | अभी कोई विषय उपलब्ध नहीं है। |

### Progress Page
| Key | en | hi |
|-----|----|----|
| `progress.title` | My Progress | मेरी प्रगति |
| `progress.subtitle` | Track your learning journey | अपनी पढ़ाई की जानकारी देखें |
| `progress.chapterCompletion` | Chapter Completion | अध्याय पूरे |
| `progress.chaptersCompleted` | Chapters Completed | पूरे किए अध्याय |
| `progress.totalWatchTime` | Total Watch Time | कुल देखने का समय |
| `progress.currentStreak` | Current Streak | मौजूदा लकीर |
| `progress.quizAnalytics` | Quiz Analytics | क्विज़ की जानकारी |
| `progress.quizzesAttempted` | Quizzes Attempted | क्विज़ दिए |
| `progress.avgScore` | Average Quiz Score | औसत अंक |
| `progress.quizzesMastered` | Quizzes Mastered | महारत हासिल |
| `progress.latestQuiz` | Latest Quiz | ताज़ा क्विज़ |
| `progress.subjectProgress` | Subject Progress | विषय की प्रगति |
| `progress.chaptersToGo` | {n} chapters to go | {n} अध्याय बाकी |
| `progress.masteredLabel` | Mastered | महारत |
| `progress.quizzesTaken` | {done}/{total} quizzes taken | {done}/{total} क्विज़ दिए |
| `progress.avgQuiz` | Avg quiz {pct}% | औसत अंक {pct}% |
| `progress.masteredCount` | {n} mastered | {n} महारत |
| `progress.quizReady` | Quiz ready | क्विज़ तैयार है |
| `progress.best` | Best {pct}% | बेस्ट {pct}% |
| `progress.completed` | Completed | पूरा हो गया |
| `progress.inProgress` | In progress | जारी है |
| `progress.notStarted` | Not started | शुरू नहीं हुआ |
| `progress.videosComplete` | {done}/{total} videos complete | {done}/{total} वीडियो पूरे |
| `progress.chapterNo` | Chapter {n} | अध्याय {n} |
| `progress.quizQuestions` | Quiz · {n} questions | क्विज़ · {n} सवाल |
| `progress.days` | {n} days | {n} दिन |

---

## Data Flow

```
Server layout (layout.tsx)
  → fetches profile.ui_language
  → passes to <LanguageProvider initialLang={...}>
      → client components call useLanguage() → t(key)
      → user clicks toggle → setLang('hi')
          → optimistic state update (instant re-render)
          → updateLanguage('hi') server action
              → UPDATE profiles SET ui_language = 'hi'
              → cookies().set('ui_language', 'hi')

Server page.tsx files
  → getServerLang() reads cookie
  → t(lang, 'key') inline in JSX
```

---

## Error Handling

- If `getServerLang()` fails to read the cookie, defaults to `'en'`.
- If a translation key is missing, `t()` falls back to the English string and logs a warning in development.
- If the Supabase update in `updateLanguage()` fails, the optimistic UI state stays — the cookie still reflects the change so the user sees the new language. A retry is not needed; it will self-correct on next sign-in when the profile is re-fetched.
