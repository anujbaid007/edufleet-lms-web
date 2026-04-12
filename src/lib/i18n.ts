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
    // Missing keys
    "nav.more": "More",
    "hero.hey": "Hey",
    "hero.learner": "learner",
    "quiz.subjectPracticeTrack": "{name} practice track",
    "quiz.subjectHeroDesc": "{done}/{total} lesson videos completed across this subject. Retake weaker chapters and keep building toward mastery.",
    "quiz.chapterLabel": "Chapter {n}",
    "quiz.questionsCount": "{n} questions",
    "quiz.readyToAttempt": "Ready to attempt",
    "quiz.lessonVideoProgress": "{done}/{total} videos completed · {pct}% lesson progress",
    "quiz.bestScore": "Best score",
    "quiz.correct": "correct",
    "quiz.retake": "Retake quiz",
    "quiz.start": "Start quiz",
    "quiz.openChapter": "Open chapter",
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
    // Missing keys
    "nav.more": "और",
    "hero.hey": "हे",
    "hero.learner": "छात्र",
    "quiz.subjectPracticeTrack": "{name} practise ट्रैक",
    "quiz.subjectHeroDesc": "इस विषय के {done}/{total} पाठ वीडियो पूरे हो गए। कमज़ोर अध्याय दोबारा करो और महारत की तरफ बढ़ते रहो।",
    "quiz.chapterLabel": "अध्याय {n}",
    "quiz.questionsCount": "{n} सवाल",
    "quiz.readyToAttempt": "शुरू करें",
    "quiz.lessonVideoProgress": "{done}/{total} वीडियो पूरे · {pct}% पाठ प्रगति",
    "quiz.bestScore": "सर्वश्रेष्ठ",
    "quiz.correct": "सही",
    "quiz.retake": "दोबारा करें",
    "quiz.start": "क्विज़ शुरू करें",
    "quiz.openChapter": "अध्याय खोलें",
  },
} satisfies Record<Lang, Record<string, string>>;

/**
 * Translate a key for the given language.
 * Supports {varName} interpolation: t("en", "hero.chapters", { done: 3, total: 10 })
 * Falls back to English string, then raw key if missing.
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
 * Read the current language from the ui_language cookie (server-side only).
 * In Next.js 14, cookies() is synchronous.
 * Falls back to "en" if cookie is missing or invalid.
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
