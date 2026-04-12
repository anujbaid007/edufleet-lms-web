# Language Switcher (EN / HI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an English/Hindi UI language toggle to the dashboard sidebar, persisted to Supabase profiles and a cookie, translating all app shell text across both client and server components.

**Architecture:** A central `src/lib/i18n.ts` module holds the full translation dictionary and a `t(lang, key, vars?)` function. A `LanguageProvider` context (wrapping the dashboard layout) gives client components access to `useLanguage()`. Server page components call `getServerLang()` which reads a `ui_language` cookie. Language changes update Supabase + the cookie via a server action, with an optimistic state update in the context.

**Tech Stack:** Next.js 14 (App Router), React context, Supabase (profiles table), next/headers cookies (sync in Next 14)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/i18n.ts` | Full EN+HI dictionary, `t()`, `getServerLang()` |
| Create | `src/lib/actions/language.ts` | Server action: update Supabase + set cookie |
| Create | `src/context/language-context.tsx` | `LanguageProvider` + `useLanguage()` hook |
| Modify | `src/app/(dashboard)/layout.tsx` | Add `ui_language` to profile select; wrap in `LanguageProvider` |
| Modify | `src/components/dashboard/sidebar.tsx` | Add `EN \| हि` toggle in footer |
| Modify | `src/components/dashboard/welcome-hero.tsx` | Replace hardcoded strings with `t()` |
| Modify | `src/components/dashboard/stats-overview.tsx` | Add `"use client"` + replace strings |
| Modify | `src/components/dashboard/continue-watching.tsx` | Replace section title + watched label |
| Modify | `src/components/dashboard/recommended-lessons.tsx` | Add `"use client"` + replace title |
| Modify | `src/components/dashboard/subject-grid.tsx` | Add `"use client"` + replace strings |
| Modify | `src/app/(dashboard)/dashboard/subjects/page.tsx` | `getServerLang()` + pass translated Header props |
| Modify | `src/app/(dashboard)/dashboard/progress/page.tsx` | `getServerLang()` + translate all inline strings |
| Modify | `src/app/(dashboard)/dashboard/quizzes/page.tsx` | `getServerLang()` + translate all inline strings |
| Modify | `src/app/(dashboard)/dashboard/quizzes/[subjectId]/page.tsx` | `getServerLang()` + translate Header + breadcrumbs |

---

## Task 1: Supabase migration — add `ui_language` to profiles

**Files:**
- Supabase SQL editor (or `supabase/migrations/` if using local migrations)

- [ ] **Step 1: Run SQL migration**

Open the Supabase dashboard → SQL editor (or local `supabase db push`) and run:

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ui_language TEXT NOT NULL DEFAULT 'en'
CHECK (ui_language IN ('en', 'hi'));
```

- [ ] **Step 2: Verify column exists**

In Supabase Table Editor, open `profiles` and confirm the `ui_language` column is present with default `en`.

- [ ] **Step 3: Commit migration note**

```bash
git add -A
git commit -m "feat: add ui_language column to profiles (Supabase migration)"
```

---

## Task 2: Create translation dictionary `src/lib/i18n.ts`

**Files:**
- Create: `src/lib/i18n.ts`

- [ ] **Step 1: Create the file**

```typescript
import { cookies } from "next/headers";

export type Lang = "en" | "hi";

const dict = {
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.subjects": "Subjects",
    "nav.quiz": "Quiz",
    "nav.progress": "My Progress",
    "nav.students": "My Students",
    "nav.signOut": "Sign Out",
    "nav.language": "Language",
    // Greetings
    "greeting.morning": "Good morning",
    "greeting.afternoon": "Good afternoon",
    "greeting.evening": "Good evening",
    "greeting.night": "Good night",
    "greeting.midnight": "Burning the midnight oil",
    // Motivational messages
    "msg.noChapters": "Pick your first chapter and start the adventure.",
    "msg.noProgress": "Your first chapter is waiting. One small step today.",
    "msg.fireStreak": "{n}-day streak — you're on fire. Keep it burning.",
    "msg.goodStreak": "You've shown up {n} days running. That's the stuff.",
    "msg.nearlyDone": "You're nearly there. Finish strong.",
    "msg.halfway": "Halfway through — the best part is next.",
    "msg.keepGoing": "Every minute on a chapter compounds. Let's stack another one.",
    // Welcome Hero pills / progress card
    "hero.streak": "{n}-day streak",
    "hero.startStreak": "Start a streak",
    "hero.chapters": "{done}/{total} chapters",
    "hero.noChapters": "No chapters yet",
    "hero.complete": "{pct}% complete",
    "hero.courseProgress": "Course progress",
    "hero.chaptersToGo": "{n} chapters to go",
    "hero.allDone": "All chapters wrapped — legend.",
    // Stats Overview
    "stats.overall": "Overall",
    "stats.chaptersDone": "chapters done",
    "stats.watchTime": "Watch Time",
    "stats.total": "total",
    "stats.onARoll": "On a roll",
    "stats.streak": "Streak",
    "stats.streakDays": "{n} days",
    "stats.streakDay": "1 day",
    "stats.keepRhythm": "Keep the learning rhythm going.",
    "stats.startStreak": "Start one lesson today to begin your streak.",
    "stats.subjects": "Subjects",
    "stats.inProgress": "in progress",
    // Continue Watching
    "cw.title": "Continue Watching",
    "cw.watched": "{pct}% watched",
    // Recommended / Up Next
    "rec.title": "Up Next",
    // Subject Grid (dashboard widget)
    "subjects.title": "Your Subjects",
    "subjects.learningPath": "Learning Path",
    "subjects.chaptersDone": "{done}/{total} chapters done",
    "subjects.videosCompleted": "{done}/{total} videos completed",
    // Subjects page
    "subjectsPage.title": "Your Subjects",
    "subjectsPage.subtitle": "{n} subjects available in your learning path",
    "subjectsPage.empty": "No subjects are available for your current class yet.",
    // Progress page
    "progress.title": "My Progress",
    "progress.subtitle": "Track your learning journey",
    "progress.chapterCompletion": "Chapter Completion",
    "progress.chaptersCompleted": "Chapters Completed",
    "progress.totalWatchTime": "Total Watch Time",
    "progress.currentStreak": "Current Streak",
    "progress.quizAnalytics": "Quiz Analytics",
    "progress.quizzesAttempted": "Quizzes Attempted",
    "progress.avgScore": "Average Quiz Score",
    "progress.quizzesMastered": "Quizzes Mastered",
    "progress.latestQuiz": "Latest Quiz",
    "progress.subjectProgress": "Subject Progress",
    "progress.chaptersCompletedOf": "{done}/{total} chapters completed",
    "progress.videosOf": "{done}/{total} videos",
    "progress.chaptersToGo": "{n} chapters to go",
    "progress.masteredLabel": "Mastered",
    "progress.quizzesTaken": "{done}/{total} quizzes taken",
    "progress.avgQuiz": "Avg quiz {pct}%",
    "progress.masteredCount": "{n} mastered",
    "progress.quizReady": "Quiz ready",
    "progress.best": "Best {pct}%",
    "progress.completed": "Completed",
    "progress.inProgress": "In progress",
    "progress.notStarted": "Not started",
    "progress.videosComplete": "{done}/{total} videos complete",
    "progress.chapterNo": "Chapter {n}",
    "progress.quizQuestions": "Quiz · {n} questions",
    "progress.days": "{n} days",
    // Quiz Hub page
    "quiz.hubLabel": "Quiz Hub",
    "quiz.hubTagline": "Pick a subject, then jump straight into its chapters.",
    "quiz.hubDesc": "Each subject opens on its own page, so the chapter list is ready immediately on both mobile and desktop.",
    "quiz.available": "Available Quizzes",
    "quiz.quizRun": "quiz run",
    "quiz.quizRuns": "quiz runs",
    "quiz.chapterStarted": "chapter started",
    "quiz.chaptersStarted": "chapters started",
    "quiz.totalRuns": "Quiz Runs",
    "quiz.coverage": "Coverage",
    "quiz.startedOf": "Started {done} of {total} chapters",
    "quiz.runsLogged": "{n} quiz runs logged",
    "quiz.avgScore": "Avg score",
    "quiz.mastered": "Mastered",
    "quiz.activity": "Activity",
    "quiz.chaptersReady": "Chapters ready",
    "quiz.lessonProgress": "Lesson progress",
    "quiz.videosCompleted": "{done}/{total} videos completed",
    "quiz.openChapters": "Open chapters",
    "quiz.empty": "No quizzes available yet",
    "quiz.emptyDesc": "Matched MCQ quizzes will appear here automatically for the chapters available in your learning path.",
    "quiz.subjectDesc": "Practice this subject chapter by chapter, revisit weaker scores, and continue from where you left off.",
    "quiz.quizzesCount": "{n} quizzes",
    "quiz.subjectTitle": "{name} quizzes",
    "quiz.subjectSubtitle": "All chapter quizzes for this subject are ready below.",
    "quiz.backToHub": "Back to Quiz Hub",
    "quiz.subjects": "Subjects",
  },
  hi: {
    // Navigation
    "nav.home": "होम",
    "nav.subjects": "विषय",
    "nav.quiz": "क्विज़",
    "nav.progress": "मेरी प्रगति",
    "nav.students": "मेरे छात्र",
    "nav.signOut": "लॉग आउट",
    "nav.language": "भाषा",
    // Greetings
    "greeting.morning": "सुप्रभात",
    "greeting.afternoon": "नमस्ते",
    "greeting.evening": "शुभ संध्या",
    "greeting.night": "शुभ रात्रि",
    "greeting.midnight": "रात को पढ़ रहे हो?",
    // Motivational messages
    "msg.noChapters": "पहला अध्याय शुरू करो और सफ़र की शुरुआत करो।",
    "msg.noProgress": "पहला अध्याय इंतज़ार कर रहा है। आज एक कदम बढ़ाओ।",
    "msg.fireStreak": "{n} दिन की लकीर — कमाल कर रहे हो! जारी रखो।",
    "msg.goodStreak": "{n} दिन से आ रहे हो — यही तो असली मेहनत है।",
    "msg.nearlyDone": "लगभग पहुँच गए — ज़ोर लगाओ!",
    "msg.halfway": "आधा हो गया — आगे और मज़ेदार है।",
    "msg.keepGoing": "हर मिनट मायने रखता है। एक और अध्याय करो।",
    // Welcome Hero pills / progress card
    "hero.streak": "{n} दिन की लकीर",
    "hero.startStreak": "आज से शुरुआत करो",
    "hero.chapters": "{done}/{total} अध्याय",
    "hero.noChapters": "अभी कोई अध्याय नहीं",
    "hero.complete": "{pct}% पूर्ण",
    "hero.courseProgress": "कोर्स की प्रगति",
    "hero.chaptersToGo": "{n} अध्याय बाकी",
    "hero.allDone": "सारे अध्याय पूरे — शाबाश!",
    // Stats Overview
    "stats.overall": "कुल",
    "stats.chaptersDone": "अध्याय पूरे",
    "stats.watchTime": "देखने का समय",
    "stats.total": "कुल",
    "stats.onARoll": "शानदार चल रहे हो!",
    "stats.streak": "लकीर",
    "stats.streakDays": "{n} दिन",
    "stats.streakDay": "1 दिन",
    "stats.keepRhythm": "सीखते रहो, रुको नहीं।",
    "stats.startStreak": "आज एक पाठ पूरा करो और शुरुआत करो।",
    "stats.subjects": "विषय",
    "stats.inProgress": "जारी है",
    // Continue Watching
    "cw.title": "जारी रखें",
    "cw.watched": "{pct}% देखा",
    // Recommended / Up Next
    "rec.title": "अगला पाठ",
    // Subject Grid (dashboard widget)
    "subjects.title": "आपके विषय",
    "subjects.learningPath": "लर्निंग पाथ",
    "subjects.chaptersDone": "{done}/{total} अध्याय पूरे",
    "subjects.videosCompleted": "{done}/{total} वीडियो पूरे",
    // Subjects page
    "subjectsPage.title": "आपके विषय",
    "subjectsPage.subtitle": "{n} विषय उपलब्ध हैं",
    "subjectsPage.empty": "अभी कोई विषय उपलब्ध नहीं है।",
    // Progress page
    "progress.title": "मेरी प्रगति",
    "progress.subtitle": "अपनी पढ़ाई की जानकारी देखें",
    "progress.chapterCompletion": "अध्याय पूरे",
    "progress.chaptersCompleted": "पूरे किए अध्याय",
    "progress.totalWatchTime": "कुल देखने का समय",
    "progress.currentStreak": "मौजूदा लकीर",
    "progress.quizAnalytics": "क्विज़ की जानकारी",
    "progress.quizzesAttempted": "क्विज़ दिए",
    "progress.avgScore": "औसत अंक",
    "progress.quizzesMastered": "महारत हासिल",
    "progress.latestQuiz": "ताज़ा क्विज़",
    "progress.subjectProgress": "विषय की प्रगति",
    "progress.chaptersCompletedOf": "{done}/{total} अध्याय पूरे",
    "progress.videosOf": "{done}/{total} वीडियो",
    "progress.chaptersToGo": "{n} अध्याय बाकी",
    "progress.masteredLabel": "महारत",
    "progress.quizzesTaken": "{done}/{total} क्विज़ दिए",
    "progress.avgQuiz": "औसत अंक {pct}%",
    "progress.masteredCount": "{n} महारत",
    "progress.quizReady": "क्विज़ तैयार है",
    "progress.best": "बेस्ट {pct}%",
    "progress.completed": "पूरा हो गया",
    "progress.inProgress": "जारी है",
    "progress.notStarted": "शुरू नहीं हुआ",
    "progress.videosComplete": "{done}/{total} वीडियो पूरे",
    "progress.chapterNo": "अध्याय {n}",
    "progress.quizQuestions": "क्विज़ · {n} सवाल",
    "progress.days": "{n} दिन",
    // Quiz Hub page
    "quiz.hubLabel": "क्विज़ हब",
    "quiz.hubTagline": "कोई विषय चुनो और सीधे उसके अध्यायों में जाओ।",
    "quiz.hubDesc": "हर विषय अपने पेज पर खुलता है, जिससे अध्यायों की सूची तुरंत मिलती है।",
    "quiz.available": "उपलब्ध क्विज़",
    "quiz.quizRun": "क्विज़ रन",
    "quiz.quizRuns": "क्विज़ रन",
    "quiz.chapterStarted": "अध्याय शुरू किया",
    "quiz.chaptersStarted": "अध्याय शुरू किए",
    "quiz.totalRuns": "क्विज़ रन",
    "quiz.coverage": "कवरेज",
    "quiz.startedOf": "{done} में से {total} अध्याय शुरू",
    "quiz.runsLogged": "{n} क्विज़ रन दर्ज",
    "quiz.avgScore": "औसत अंक",
    "quiz.mastered": "महारत",
    "quiz.activity": "गतिविधि",
    "quiz.chaptersReady": "अध्याय तैयार",
    "quiz.lessonProgress": "पाठ की प्रगति",
    "quiz.videosCompleted": "{done}/{total} वीडियो पूरे",
    "quiz.openChapters": "अध्याय देखें",
    "quiz.empty": "अभी कोई क्विज़ उपलब्ध नहीं",
    "quiz.emptyDesc": "आपके लर्निंग पाथ के अध्यायों के लिए क्विज़ अपने आप यहाँ दिखेंगे।",
    "quiz.subjectDesc": "इस विषय को अध्याय दर अध्याय practise करो, कमज़ोर स्कोर दोबारा सुधारो, और जहाँ छोड़ा था वहाँ से जारी रखो।",
    "quiz.quizzesCount": "{n} क्विज़",
    "quiz.subjectTitle": "{name} क्विज़",
    "quiz.subjectSubtitle": "इस विषय के सभी अध्याय क्विज़ नीचे तैयार हैं।",
    "quiz.backToHub": "क्विज़ हब पर वापस",
    "quiz.subjects": "विषय",
  },
} satisfies Record<Lang, Record<string, string>>;

type DictKey = keyof typeof dict.en;

/**
 * Translate a key for the given language.
 * Supports {varName} interpolation: t("en", "hero.chapters", { done: 3, total: 10 })
 * Falls back to English, then the raw key if missing.
 */
export function t(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw =
    (dict[lang] as Record<string, string>)[key] ??
    (dict.en as Record<string, string>)[key] ??
    key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Read the current language from the ui_language cookie.
 * Safe to call in any server component or server action.
 * Falls back to "en" if the cookie is missing or invalid.
 */
export function getServerLang(): Lang {
  try {
    const val = cookies().get("ui_language")?.value;
    if (val === "en" || val === "hi") return val;
  } catch {
    // cookies() throws outside a request context (e.g. during build)
  }
  return "en";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/anuj/Desktop/Projects/edufleet-lms-web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `src/lib/i18n.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat: add i18n translation dictionary and helpers"
```

---

## Task 3: Create server action `src/lib/actions/language.ts`

**Files:**
- Create: `src/lib/actions/language.ts`

- [ ] **Step 1: Create the file**

```typescript
"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/i18n";

export async function updateLanguage(lang: Lang): Promise<void> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase
    .from("profiles")
    .update({ ui_language: lang })
    .eq("id", session.user.id);

  cookies().set("ui_language", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: false, // readable client-side is fine; not a secret
  });
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/language.ts
git commit -m "feat: add updateLanguage server action"
```

---

## Task 4: Create `src/context/language-context.tsx`

**Files:**
- Create: `src/context/language-context.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { t as tFn, type Lang } from "@/lib/i18n";
import { updateLanguage } from "@/lib/actions/language";

interface LanguageContextValue {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  t: (key) => key,
  setLang: () => {},
});

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    // Fire-and-forget: optimistic update is immediate, Supabase + cookie update is async
    updateLanguage(newLang);
  }, []);

  const tClient = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      tFn(lang, key, vars),
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, t: tClient, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/context/language-context.tsx
git commit -m "feat: add LanguageProvider context and useLanguage hook"
```

---

## Task 5: Update dashboard layout to wire up `LanguageProvider`

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add `ui_language` to profile select and wrap with `LanguageProvider`**

Replace the entire file with:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { ProfileDrawer } from "@/components/dashboard/profile-drawer";
import { LanguageProvider } from "@/context/language-context";
import type { Lang } from "@/lib/i18n";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");
  const user = session.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name, org_id, centre_id, class, board, medium, phone, avatar_url, ui_language")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const [orgResult, centreResult] = await Promise.all([
    profile.org_id
      ? supabase.from("organizations").select("name").eq("id", profile.org_id).single()
      : Promise.resolve({ data: null }),
    profile.centre_id
      ? supabase.from("centres").select("name").eq("id", profile.centre_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const drawerProps = {
    userId: user.id,
    name: profile.name,
    email: user.email ?? null,
    role: profile.role,
    classNum: profile.class,
    board: profile.board,
    medium: profile.medium,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    organizationName: orgResult.data?.name ?? null,
    centreName: centreResult.data?.name ?? null,
  };

  const initialLang: Lang =
    profile.ui_language === "hi" ? "hi" : "en";

  return (
    <LanguageProvider initialLang={initialLang}>
      <div className="min-h-screen">
        <Sidebar
          userRole={profile.role}
          userName={profile.name}
          mobileSlot={<ProfileDrawer {...drawerProps} compact />}
        />
        <main className="px-4 pb-28 pt-24 transition-all duration-300 sm:px-6 sm:pb-32 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mb-4 hidden justify-end lg:mb-6 lg:flex">
            <ProfileDrawer {...drawerProps} />
          </div>
          {children}
        </main>
      </div>
    </LanguageProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Start dev server and confirm dashboard loads**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`. The page should load with no errors. Language state is wired but the toggle hasn't been added yet.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: wire LanguageProvider into dashboard layout"
```

---

## Task 6: Add language toggle to the sidebar

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add imports and toggle UI**

At the top of `src/components/dashboard/sidebar.tsx`, add these two imports after the existing ones:

```typescript
import { useLanguage } from "@/context/language-context";
import type { Lang } from "@/lib/i18n";
```

- [ ] **Step 2: Destructure `lang`, `t`, and `setLang` inside the `Sidebar` function**

Add this line right after the existing hooks at the top of the `Sidebar` function body (after the `useState` calls):

```typescript
const { lang, t, setLang } = useLanguage();
```

- [ ] **Step 3: Update nav link labels to use `t()`**

Replace the `studentLinks` and `teacherLinks` arrays. Because hooks cannot be called outside components, move the link arrays **inside** the `Sidebar` function body, after the `useLanguage()` line:

```typescript
const studentLinks = [
  { href: "/dashboard", label: t("nav.home"), icon: Home, isActive: isHomeActive },
  { href: "/dashboard/subjects", label: t("nav.subjects"), icon: BookOpen, isActive: isSubjectsActive },
  { href: "/dashboard/quizzes", label: t("nav.quiz"), icon: Trophy, isActive: isQuizActive },
  { href: "/dashboard/progress", label: t("nav.progress"), icon: BarChart3 },
] satisfies DashboardLink[];

const teacherLinks = [
  { href: "/dashboard", label: t("nav.home"), icon: Home, isActive: isHomeActive },
  { href: "/dashboard/subjects", label: t("nav.subjects"), icon: BookOpen, isActive: isSubjectsActive },
  { href: "/dashboard/quizzes", label: t("nav.quiz"), icon: Trophy, isActive: isQuizActive },
  { href: "/dashboard/students", label: t("nav.students"), icon: Users },
  { href: "/dashboard/progress", label: t("nav.progress"), icon: BarChart3 },
] satisfies DashboardLink[];
```

Remove the old `studentLinks` and `teacherLinks` const declarations that were outside the component.

- [ ] **Step 4: Add the language toggle in the sidebar footer**

In the sidebar's bottom section (the `<div className="space-y-2 border-t ...">` block), add the language toggle **above** the logout form. Replace that div with:

```tsx
<div className="space-y-2 border-t border-orange-primary/10 px-3 py-4">
  {!collapsed && (
    <div className="px-4 py-2">
      <p className="truncate text-sm font-semibold text-heading">{userName}</p>
      <p className="text-xs capitalize text-muted">{userRole}</p>
    </div>
  )}

  {/* Language toggle */}
  {collapsed ? (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      className="flex w-full items-center justify-center rounded-clay-sm px-4 py-3 text-xs font-bold text-muted transition-all hover:bg-cream/80 hover:text-heading"
      aria-label="Switch language"
      title={t("nav.language")}
    >
      {lang === "en" ? "हि" : "EN"}
    </button>
  ) : (
    <div className="px-4 py-1">
      <p className="mb-1.5 text-[11px] font-medium text-muted">{t("nav.language")}</p>
      <div className="flex overflow-hidden rounded-full border border-orange-primary/20 bg-white/80">
        {(["en", "hi"] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold transition-colors",
              lang === l
                ? "bg-orange-primary text-white"
                : "text-muted hover:text-heading"
            )}
          >
            {l === "en" ? "EN" : "हि"}
          </button>
        ))}
      </div>
    </div>
  )}

  <form action={logout}>
    <button
      type="submit"
      className="flex w-full items-center gap-3 rounded-clay-sm px-4 py-3 text-sm font-medium text-body transition-all hover:bg-red-50/80 hover:text-red-600"
    >
      <LogOut className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{t("nav.signOut")}</span>}
    </button>
  </form>
</div>
```

- [ ] **Step 5: Verify in browser**

Reload `http://localhost:3000/dashboard`. The sidebar should show the `EN | हि` pill at the bottom. Clicking `हि` should update the toggle immediately (optimistic). Check the Supabase `profiles` table to confirm `ui_language` updates after a few seconds.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/sidebar.tsx
git commit -m "feat: add EN/HI language toggle to sidebar"
```

---

## Task 7: Translate `welcome-hero.tsx`

**Files:**
- Modify: `src/components/dashboard/welcome-hero.tsx`

- [ ] **Step 1: Add `useLanguage` import**

Add after the existing imports:

```typescript
import { useLanguage } from "@/context/language-context";
```

- [ ] **Step 2: Rewrite `getGreeting` and `pickMessage` to use `t`**

These functions currently return hardcoded English strings. Replace them with key returns so the component can call `t()`:

```typescript
function getGreetingKey(hour: number): { key: string; icon: React.ComponentType<{ className?: string }> } {
  if (hour < 5) return { key: "greeting.midnight", icon: Moon };
  if (hour < 12) return { key: "greeting.morning", icon: Sunrise };
  if (hour < 17) return { key: "greeting.afternoon", icon: Sun };
  if (hour < 21) return { key: "greeting.evening", icon: Sun };
  return { key: "greeting.night", icon: Moon };
}

function pickMessageKey(streak: number, completed: number, total: number): string {
  if (total === 0) return "msg.noChapters";
  if (completed === 0) return "msg.noProgress";
  if (streak >= 7) return "msg.fireStreak";
  if (streak >= 3) return "msg.goodStreak";
  if (completed >= Math.floor(total * 0.75)) return "msg.nearlyDone";
  if (completed >= Math.floor(total / 2)) return "msg.halfway";
  return "msg.keepGoing";
}
```

Remove the old `getGreeting` and `pickMessage` functions entirely.

- [ ] **Step 3: Update `WelcomeHero` component body**

Inside `WelcomeHero`, add `const { t } = useLanguage();` as the first line.

Then update the `useMemo` block:

```typescript
const { greetingLabel, GreetingIcon, message, displayName, progressPercent } = useMemo(() => {
  const hour = new Date().getHours();
  const { key: greetingKey, icon } = getGreetingKey(hour);
  const msgKey = pickMessageKey(streak, completedChapters, totalChapters);
  const n = streak;
  return {
    greetingLabel: t(greetingKey),
    GreetingIcon: icon,
    message: t(msgKey, { n }),
    displayName: firstWord(name),
    progressPercent:
      totalChapters > 0
        ? Math.round((completedChapters / totalChapters) * 100)
        : 0,
  };
}, [name, streak, completedChapters, totalChapters, t]);
```

- [ ] **Step 4: Update JSX strings**

Replace the hardcoded pill labels and progress card strings:

| Find | Replace with |
|------|-------------|
| `` streak > 0 ? `${streak}-day streak` : "Start a streak" `` | `` streak > 0 ? t("hero.streak", { n: streak }) : t("hero.startStreak") `` |
| `` totalChapters > 0 ? `${completedChapters}/${totalChapters} chapters` : "No chapters yet" `` | `` totalChapters > 0 ? t("hero.chapters", { done: completedChapters, total: totalChapters }) : t("hero.noChapters") `` |
| `` `${progressPercent}% complete` `` | `` t("hero.complete", { pct: progressPercent }) `` |
| `"Course progress"` | `` t("hero.courseProgress") `` |
| `` `${totalChapters - completedChapters} chapters to go` `` | `` t("hero.chaptersToGo", { n: totalChapters - completedChapters }) `` |
| `"All chapters wrapped — legend."` | `` t("hero.allDone") `` |

- [ ] **Step 5: Verify in browser**

Switch to Hindi in the sidebar. The welcome hero greetings, pills, and progress card text should all appear in Hindi. Switch back to English — everything returns.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/welcome-hero.tsx
git commit -m "feat: translate welcome hero to EN/HI"
```

---

## Task 8: Translate `stats-overview.tsx`

**Files:**
- Modify: `src/components/dashboard/stats-overview.tsx`

- [ ] **Step 1: Add `"use client"` directive and import**

Add `"use client";` as the very first line of the file.

Then add the import after the existing imports:

```typescript
import { useLanguage } from "@/context/language-context";
```

- [ ] **Step 2: Add `useLanguage` inside the component and replace strings**

Inside `StatsOverview`, add as first line:

```typescript
const { t } = useLanguage();
```

Then replace hardcoded strings:

| Find | Replace |
|------|---------|
| `const streakLabel = streakStarted ? "On a roll" : "Streak";` | `const streakLabel = streakStarted ? t("stats.onARoll") : t("stats.streak");` |
| `const streakValue = streak === 1 ? "1 day" : \`${streak} days\`;` | `const streakValue = streak === 1 ? t("stats.streakDay") : t("stats.streakDays", { n: streak });` |
| `const streakSubtext = streakStarted ? "Keep the learning rhythm going." : "Start one lesson today to begin your streak.";` | `const streakSubtext = streakStarted ? t("stats.keepRhythm") : t("stats.startStreak");` |
| `"Overall"` | `{t("stats.overall")}` |
| `"chapters done"` | `{t("stats.chaptersDone")}` |
| `"Watch Time"` | `{t("stats.watchTime")}` |
| `"total"` (the subtext under watch time) | `{t("stats.total")}` |
| `"Subjects"` | `{t("stats.subjects")}` |
| `"in progress"` | `{t("stats.inProgress")}` |

- [ ] **Step 3: Verify**

With Hindi selected, the 4 stat cards should show Hindi labels. Switch to English — labels return.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/stats-overview.tsx
git commit -m "feat: translate stats overview to EN/HI"
```

---

## Task 9: Translate `continue-watching.tsx`, `recommended-lessons.tsx`, `subject-grid.tsx`

**Files:**
- Modify: `src/components/dashboard/continue-watching.tsx`
- Modify: `src/components/dashboard/recommended-lessons.tsx`
- Modify: `src/components/dashboard/subject-grid.tsx`

### continue-watching.tsx

- [ ] **Step 1: Add `useLanguage` (already has `"use client"`)**

Add after the existing imports:

```typescript
import { useLanguage } from "@/context/language-context";
```

Add as first line inside `ContinueWatching`:

```typescript
const { t } = useLanguage();
```

Replace:

| Find | Replace |
|------|---------|
| `"Continue Watching"` | `{t("cw.title")}` |
| `` `${item.watchedPercentage}% watched` `` | `` {t("cw.watched", { pct: item.watchedPercentage })} `` |

### recommended-lessons.tsx

- [ ] **Step 2: Add `"use client"` and translate**

Add `"use client";` as the very first line.

Add import:

```typescript
import { useLanguage } from "@/context/language-context";
```

Add inside `RecommendedLessons` as first line:

```typescript
const { t } = useLanguage();
```

Replace:

| Find | Replace |
|------|---------|
| `"Up Next"` | `{t("rec.title")}` |

### subject-grid.tsx

- [ ] **Step 3: Add `"use client"` and translate**

Add `"use client";` as the very first line.

Add import:

```typescript
import { useLanguage } from "@/context/language-context";
```

Add inside `SubjectGrid` as first line:

```typescript
const { t } = useLanguage();
```

Replace:

| Find | Replace |
|------|---------|
| `"Your Subjects"` (the `<h2>`) | `{t("subjects.title")}` |
| `"Learning Path"` | `{t("subjects.learningPath")}` |
| `` `${subject.completedChapters}/${subject.totalChapters} chapters done` `` | `` {t("subjects.chaptersDone", { done: subject.completedChapters, total: subject.totalChapters })} `` |
| `` `${subject.completedVideos}/${subject.totalVideos} videos completed` `` | `` {t("subjects.videosCompleted", { done: subject.completedVideos, total: subject.totalVideos })} `` |

- [ ] **Step 4: Verify**

Switch to Hindi. Dashboard home should show translated section titles and subject card labels.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/continue-watching.tsx src/components/dashboard/recommended-lessons.tsx src/components/dashboard/subject-grid.tsx
git commit -m "feat: translate dashboard widgets (continue watching, recommended, subjects)"
```

---

## Task 10: Translate server pages — subjects and progress

**Files:**
- Modify: `src/app/(dashboard)/dashboard/subjects/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/progress/page.tsx`

### subjects/page.tsx

- [ ] **Step 1: Add `getServerLang` + `t` imports and use them**

Add after the existing imports:

```typescript
import { getServerLang, t } from "@/lib/i18n";
```

At the start of `SubjectsPage` (before the Supabase calls), add:

```typescript
const lang = getServerLang();
```

Replace the `<Header>` call:

```tsx
// Before:
<Header
  title="Your Subjects"
  subtitle={`${subjects.length} subjects available in your learning path`}
/>

// After:
<Header
  title={t(lang, "subjectsPage.title")}
  subtitle={t(lang, "subjectsPage.subtitle", { n: subjects.length })}
/>
```

Replace the empty state message:

```tsx
// Before:
<p className="text-muted">No subjects are available for your current class yet.</p>

// After:
<p className="text-muted">{t(lang, "subjectsPage.empty")}</p>
```

### progress/page.tsx

- [ ] **Step 2: Add imports and `lang` variable**

Add after the existing imports:

```typescript
import { getServerLang, t } from "@/lib/i18n";
```

Add at the very start of `ProgressPage` (before any Supabase calls):

```typescript
const lang = getServerLang();
```

- [ ] **Step 3: Replace all hardcoded strings in progress/page.tsx JSX**

Replace `<Header>`:

```tsx
<Header title={t(lang, "progress.title")} subtitle={t(lang, "progress.subtitle")} />
```

Replace the 4 overall stat card labels:

```tsx
// "Chapter Completion" → {t(lang, "progress.chapterCompletion")}
// "Chapters Completed" → {t(lang, "progress.chaptersCompleted")}
// "Total Watch Time"   → {t(lang, "progress.totalWatchTime")}
// "Current Streak"     → {t(lang, "progress.currentStreak")}
// "{streak} days"      → {t(lang, "progress.days", { n: streak })}
```

Replace `<h2>Quiz Analytics</h2>`:

```tsx
<h2 className="text-lg font-bold text-heading font-poppins">{t(lang, "progress.quizAnalytics")}</h2>
```

Replace the 4 quiz stat card labels:

```tsx
// "Quizzes Attempted"  → {t(lang, "progress.quizzesAttempted")}
// `{attemptedQuizzes}/{totalQuizzes}` label stays numeric
// "Average Quiz Score" → {t(lang, "progress.avgScore")}
// "Quizzes Mastered"   → {t(lang, "progress.quizzesMastered")}
// latestQuiz label:
{latestQuizAttempt ? getQuizMasteryLabel(latestQuizAttempt.masteryLevel) : t(lang, "progress.latestQuiz")}
```

Replace `<h2>Subject Progress</h2>`:

```tsx
<h2 className="text-lg font-bold text-heading font-poppins">{t(lang, "progress.subjectProgress")}</h2>
```

Replace per-subject summary pills:

```tsx
// "{sub.completedChapters}/{sub.totalChapters} chapters completed"
{t(lang, "progress.chaptersCompletedOf", { done: sub.completedChapters, total: sub.totalChapters })}

// "{sub.completedVideos}/{sub.totalVideos} videos"
{t(lang, "progress.videosOf", { done: sub.completedVideos, total: sub.totalVideos })}

// sub.percent === 100 ? "Mastered" : `${sub.totalChapters - sub.completedChapters} chapters to go`
{sub.percent === 100
  ? t(lang, "progress.masteredLabel")
  : t(lang, "progress.chaptersToGo", { n: sub.totalChapters - sub.completedChapters })}

// "{sub.attemptedQuizzes}/{sub.totalQuizzes} quizzes taken"
{t(lang, "progress.quizzesTaken", { done: sub.attemptedQuizzes, total: sub.totalQuizzes })}

// "Avg quiz {sub.averageQuizScore}%"
{t(lang, "progress.avgQuiz", { pct: sub.averageQuizScore })}

// "{sub.masteredQuizzes} mastered"
{t(lang, "progress.masteredCount", { n: sub.masteredQuizzes })}
```

Replace per-chapter row strings:

```tsx
// "Chapter {ch.chapter_no}: {ch.title}"
{t(lang, "progress.chapterNo", { n: ch.chapter_no })}: {ch.title}

// "{ch.completedVideos}/{ch.totalVideos} videos complete"
{t(lang, "progress.videosComplete", { done: ch.completedVideos, total: ch.totalVideos })}

// "Quiz · {ch.quizQuestionCount} questions"
{t(lang, "progress.quizQuestions", { n: ch.quizQuestionCount })}

// "Quiz ready"
{t(lang, "progress.quizReady")}

// "Best {ch.quizBestAttempt.percent}%"
{t(lang, "progress.best", { pct: ch.quizBestAttempt.percent })}

// status pill: "Completed" / "In progress" / "Not started"
{ch.completed
  ? t(lang, "progress.completed")
  : ch.completedVideos > 0
    ? t(lang, "progress.inProgress")
    : t(lang, "progress.notStarted")}
```

- [ ] **Step 4: Verify**

Switch to Hindi, navigate to `/dashboard/subjects` and `/dashboard/progress`. All static labels should be in Hindi. Subject and chapter names (database content) remain in English.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/dashboard/subjects/page.tsx src/app/(dashboard)/dashboard/progress/page.tsx
git commit -m "feat: translate subjects and progress server pages to EN/HI"
```

---

## Task 11: Translate server pages — quizzes

**Files:**
- Modify: `src/app/(dashboard)/dashboard/quizzes/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/quizzes/[subjectId]/page.tsx`

### quizzes/page.tsx

- [ ] **Step 1: Add imports and `lang`**

```typescript
import { getServerLang, t } from "@/lib/i18n";
```

At the start of `QuizzesPage`:

```typescript
const lang = getServerLang();
```

- [ ] **Step 2: Replace `formatQuizRuns` and `formatStartedChapters` with language-aware versions**

Replace both helper functions:

```typescript
function formatQuizRuns(count: number, lang: import("@/lib/i18n").Lang): string {
  return count === 1
    ? t(lang, "quiz.quizRun")
    : t(lang, "quiz.quizRuns");
}

function formatStartedChapters(count: number, lang: import("@/lib/i18n").Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.chapterStarted") : t(lang, "quiz.chaptersStarted")}`;
}
```

Pass `lang` when calling them: `formatQuizRuns(count, lang)` and `formatStartedChapters(count, lang)`.

- [ ] **Step 3: Replace hardcoded JSX strings**

```tsx
// <Header title="Quiz" /> →
<Header title={t(lang, "nav.quiz")} />

// "Quiz Hub" badge →
{t(lang, "quiz.hubLabel")}

// "Pick a subject..." h2 →
{t(lang, "quiz.hubTagline")}

// "Each subject now opens..." p →
{t(lang, "quiz.hubDesc")}

// "Available Quizzes" →
{t(lang, "quiz.available")}

// "Subjects" (the BookOpen card label) →
{t(lang, "quiz.subjects")}

// "Quiz Runs" →
{t(lang, "quiz.totalRuns")}

// subject card: "Coverage" →
{t(lang, "quiz.coverage")}

// "Started {done} of {total} chapters" →
{t(lang, "quiz.startedOf", { done: subject.attemptedQuizzes, total: subject.totalQuizzes })}

// "{n} quiz runs logged" →
{t(lang, "quiz.runsLogged", { n: subject.totalAttempts })}

// "Avg score" →
{t(lang, "quiz.avgScore")}

// "Mastered" →
{t(lang, "quiz.mastered")}

// "Activity" →
{t(lang, "quiz.activity")}

// "Chapters ready" →
{t(lang, "quiz.chaptersReady")}

// "Lesson progress" →
{t(lang, "quiz.lessonProgress")}

// "{done}/{total} videos completed" →
{t(lang, "quiz.videosCompleted", { done: subject.completedVideos, total: subject.totalVideos })}

// "Open chapters" →
{t(lang, "quiz.openChapters")}

// subject description paragraph →
{t(lang, "quiz.subjectDesc")}

// "{n} quizzes" badge →
{t(lang, "quiz.quizzesCount", { n: subject.totalQuizzes })}

// Empty state:
// "No quizzes available yet" →
{t(lang, "quiz.empty")}
// "Matched MCQ quizzes will appear..." →
{t(lang, "quiz.emptyDesc")}
```

### quizzes/[subjectId]/page.tsx

- [ ] **Step 4: Add imports and `lang` to `QuizSubjectPage`**

```typescript
import { getServerLang, t } from "@/lib/i18n";
```

```typescript
const lang = getServerLang();
```

Replace the same `formatQuizRuns` and `formatStartedChapters` helpers here too (same pattern as above — both files duplicate them):

```typescript
function formatQuizRuns(count: number, lang: import("@/lib/i18n").Lang): string {
  return count === 1
    ? t(lang, "quiz.quizRun")
    : t(lang, "quiz.quizRuns");
}

function formatStartedChapters(count: number, lang: import("@/lib/i18n").Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.chapterStarted") : t(lang, "quiz.chaptersStarted")}`;
}
```

Replace `<PageBreadcrumbs backLabel>` and `<Header>`:

```tsx
<PageBreadcrumbs
  backHref="/dashboard/quizzes"
  backLabel={t(lang, "quiz.backToHub")}
  crumbs={[
    { href: "/dashboard/quizzes", label: t(lang, "nav.quiz") },
    { href: getQuizSubjectHref(subject.id), label: subject.name },
  ]}
/>

<Header
  title={t(lang, "quiz.subjectTitle", { name: subject.name })}
  subtitle={t(lang, "quiz.subjectSubtitle")}
/>
```

- [ ] **Step 5: Verify**

Switch to Hindi. Navigate to `/dashboard/quizzes`. The page header, hub label, stat card labels, and subject card text should be in Hindi. Subject names remain in English.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/dashboard/quizzes/page.tsx src/app/(dashboard)/dashboard/quizzes/\[subjectId\]/page.tsx
git commit -m "feat: translate quiz hub and quiz subject server pages to EN/HI"
```

---

## Task 12: Final verification and TypeScript check

- [ ] **Step 1: TypeScript full check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors. Fix any type errors before continuing.

- [ ] **Step 2: End-to-end language switch check**

With `npm run dev` running, test this flow:

1. Log in as a student. Sidebar shows `EN | हि` toggle.
2. Click `हि`. Nav labels, welcome hero, stats, section titles all switch to Hindi immediately.
3. Refresh the page. Hindi persists (cookie + Supabase).
4. Navigate to Subjects, Progress, Quiz pages. All static UI text is in Hindi. Subject/chapter/quiz names stay in English.
5. Click `EN`. Everything switches back. Refresh confirms persistence.

- [ ] **Step 3: Collapsed sidebar check**

Collapse the desktop sidebar (click the `<` button). The language area should show just `हि` or `EN` as a small button that cycles on click.

- [ ] **Step 4: Mobile check**

On a narrow viewport, open the sidebar drawer. The `EN | हि` toggle should appear in the footer above Sign Out.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete EN/HI language switcher across all dashboard pages"
```
