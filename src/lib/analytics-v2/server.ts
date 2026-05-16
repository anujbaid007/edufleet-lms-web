"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ───

export type CentreStats = {
  id: string;
  name: string;
  orgName: string;
  mode: "online" | "offline";
  location: string | null;
  learnerCount: number;
  activeLearners: number;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  totalLessons: number;
  watchedLessons: number;
  quizAttempts: number;
  avgQuizScore: number | null;
  bestQuizScore: number | null;
  masteryDistribution: { mastery: number; proficient: number; developing: number; needs_practice: number };
  lastActivityAt: string | null;
  lastSyncAt: string | null;
};

export type SubjectStats = {
  id: string;
  name: string;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  totalLessons: number;
  watchedLessons: number;
  quizAttempts: number;
  bestQuizScore: number | null;
};

export type ChapterStats = {
  id: string;
  chapterNo: number;
  title: string;
  totalLessons: number;
  completedLessons: number;
  isComplete: boolean;
  quizAttempts: number;
  bestQuizScore: number | null;
  lessons: LessonStats[];
};

export type LessonStats = {
  id: string;
  title: string;
  sortOrder: number;
  durationSeconds: number;
  watchedPercentage: number;
  completed: boolean;
  lastWatchedAt: string | null;
};

export type DailyActivity = {
  date: string;
  lessonsWatched: number;
  chaptersCompleted: number;
  quizAttempts: number;
};

export type ImpactDashboard = {
  // Overview
  totalLearners: number;
  activeLearners: number;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  totalQuizAttempts: number;
  avgQuizScore: number | null;
  bestQuizScore: number | null;
  masteryDistribution: { mastery: number; proficient: number; developing: number; needs_practice: number };
  // Centres
  centres: CentreStats[];
  // Timeline
  dailyActivity: DailyActivity[];
  // Drill-down data (optional)
  subjects?: SubjectStats[];
  chapters?: ChapterStats[];
  // Meta
  generatedAt: string;
  scopeLabel: string;
};

// ─── Data Loading ───

export async function loadImpactDashboard(options?: {
  orgId?: string;
  centreId?: string;
  classNum?: number;
  subjectId?: string;
}): Promise<ImpactDashboard> {
  const supabase = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch centres
  let centreQuery = supabase
    .from("centres")
    .select("id, name, org_id, mode, location, offline_student_counts, organizations(name)")
    .eq("is_active", true);
  if (options?.orgId) centreQuery = centreQuery.eq("org_id", options.orgId);
  if (options?.centreId) centreQuery = centreQuery.eq("id", options.centreId);

  const { data: centres } = await centreQuery;
  const centreList = centres ?? [];
  const centreIds = centreList.map((c) => c.id);

  // 2. Fetch learners (students + teachers for offline)
  let learnerQuery = supabase
    .from("profiles")
    .select("id, name, org_id, centre_id, class, board, medium, role")
    .in("role", ["student", "teacher"])
    .eq("is_active", true);
  if (options?.orgId) learnerQuery = learnerQuery.eq("org_id", options.orgId);
  if (options?.centreId) learnerQuery = learnerQuery.eq("centre_id", options.centreId);

  const { data: learners } = await learnerQuery;
  const learnerList = learners ?? [];
  const learnerIds = learnerList.map((l) => l.id);

  // 3. Fetch video progress for all learners
  let progressRows: Array<{
    user_id: string;
    video_id: string;
    watched_percentage: number;
    completed: boolean;
    last_watched_at: string;
  }> = [];

  for (let i = 0; i < learnerIds.length; i += 500) {
    const chunk = learnerIds.slice(i, i + 500);
    const { data } = await supabase
      .from("video_progress")
      .select("user_id, video_id, watched_percentage, completed, last_watched_at")
      .in("user_id", chunk);
    if (data) progressRows.push(...data);
  }

  // 4. Fetch quiz attempts
  let quizRows: Array<{
    id: string;
    quiz_id: string;
    user_id: string;
    percent: number;
    mastery_level: string;
    completed_at: string;
  }> = [];

  for (let i = 0; i < learnerIds.length; i += 500) {
    const chunk = learnerIds.slice(i, i + 500);
    const { data } = await supabase
      .from("quiz_attempts")
      .select("id, quiz_id, user_id, percent, mastery_level, completed_at")
      .in("user_id", chunk);
    if (data) quizRows.push(...data);
  }

  // 5. Fetch content structure
  let chapterQuery = supabase
    .from("chapters")
    .select("id, subject_id, class, board, medium, chapter_no, title, subjects(id, name, display_order)");
  if (options?.classNum !== undefined) chapterQuery = chapterQuery.eq("class", options.classNum);
  if (options?.subjectId) chapterQuery = chapterQuery.eq("subject_id", options.subjectId);

  const { data: chapters } = await chapterQuery;
  const chapterList = chapters ?? [];

  const { data: videos } = await supabase
    .from("videos")
    .select("id, chapter_id, title, sort_order, duration_seconds");
  const videoList = videos ?? [];

  const { data: quizzes } = await supabase
    .from("chapter_quizzes")
    .select("id, chapter_id")
    .eq("is_published", true);
  const quizList = quizzes ?? [];

  // ─── Compute ───

  // Maps
  const videosByChapter = new Map<string, typeof videoList>();
  for (const v of videoList) {
    const list = videosByChapter.get(v.chapter_id) ?? [];
    list.push(v);
    videosByChapter.set(v.chapter_id, list);
  }

  const videoToChapter = new Map<string, string>();
  for (const v of videoList) videoToChapter.set(v.id, v.chapter_id);

  const quizToChapter = new Map<string, string>();
  const chapterToQuiz = new Map<string, string>();
  for (const q of quizList) {
    quizToChapter.set(q.id, q.chapter_id);
    chapterToQuiz.set(q.chapter_id, q.id);
  }

  const chapterById = new Map(chapterList.map((c) => [c.id, c]));
  const learnerByCentreId = new Map<string, typeof learnerList>();
  for (const l of learnerList) {
    if (!l.centre_id) continue;
    const list = learnerByCentreId.get(l.centre_id) ?? [];
    list.push(l);
    learnerByCentreId.set(l.centre_id, list);
  }

  // Progress maps
  const progressByVideo = new Map<string, typeof progressRows[0]>();
  for (const p of progressRows) progressByVideo.set(`${p.user_id}:${p.video_id}`, p);

  // Chapter completion: a chapter is complete if ALL its videos have completed = true
  const completedChapterIds = new Set<string>();
  const watchedVideoIds = new Set<string>();

  for (const chapter of chapterList) {
    const chapterVideos = videosByChapter.get(chapter.id) ?? [];
    if (chapterVideos.length === 0) continue;

    let allCompleted = true;
    for (const video of chapterVideos) {
      const hasAnyCompletion = progressRows.some(
        (p) => p.video_id === video.id && p.completed
      );
      if (!hasAnyCompletion) { allCompleted = false; }
      if (progressRows.some((p) => p.video_id === video.id && p.watched_percentage > 0)) {
        watchedVideoIds.add(video.id);
      }
    }
    if (allCompleted && chapterVideos.length > 0) completedChapterIds.add(chapter.id);
  }

  // Quiz stats
  const masteryDist = { mastery: 0, proficient: 0, developing: 0, needs_practice: 0 };
  let quizScoreSum = 0;
  let bestQuiz: number | null = null;
  for (const q of quizRows) {
    const level = q.mastery_level as keyof typeof masteryDist;
    if (level in masteryDist) masteryDist[level]++;
    quizScoreSum += q.percent;
    if (bestQuiz === null || q.percent > bestQuiz) bestQuiz = q.percent;
  }

  // Active learners (any activity in last 7 days)
  const activeLearnerIds = new Set<string>();
  for (const p of progressRows) {
    if (p.last_watched_at >= sevenDaysAgo) activeLearnerIds.add(p.user_id);
  }

  // Daily activity (last 30 days)
  const dailyMap = new Map<string, DailyActivity>();
  for (let d = 0; d < 30; d++) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyMap.set(date, { date, lessonsWatched: 0, chaptersCompleted: 0, quizAttempts: 0 });
  }

  for (const p of progressRows) {
    const date = p.last_watched_at?.slice(0, 10);
    if (date && dailyMap.has(date)) {
      dailyMap.get(date)!.lessonsWatched++;
    }
  }
  for (const q of quizRows) {
    const date = q.completed_at?.slice(0, 10);
    if (date && dailyMap.has(date)) {
      dailyMap.get(date)!.quizAttempts++;
    }
  }

  const trackableChapters = chapterList.filter((c) => (videosByChapter.get(c.id)?.length ?? 0) > 0);

  // ─── Centre Stats ───

  const centreStats: CentreStats[] = centreList.map((centre) => {
    const org = centre.organizations as unknown as { name: string } | null;
    const centreLearners = learnerByCentreId.get(centre.id) ?? [];
    const centreLearnerIds = new Set(centreLearners.map((l) => l.id));
    const centreProgress = progressRows.filter((p) => centreLearnerIds.has(p.user_id));
    const centreQuizzes = quizRows.filter((q) => centreLearnerIds.has(q.user_id));

    const centreActive = new Set(centreProgress.filter((p) => p.last_watched_at >= sevenDaysAgo).map((p) => p.user_id));

    // Centre chapter completion
    let centreCompletedChapters = 0;
    let centreTotalChapters = 0;
    let centreTotalLessons = 0;
    let centreWatchedLessons = 0;

    for (const chapter of trackableChapters) {
      const chapterVideos = videosByChapter.get(chapter.id) ?? [];
      centreTotalChapters++;
      centreTotalLessons += chapterVideos.length;

      let allDone = true;
      for (const video of chapterVideos) {
        const watched = centreProgress.some((p) => p.video_id === video.id && p.watched_percentage > 0);
        const completed = centreProgress.some((p) => p.video_id === video.id && p.completed);
        if (watched) centreWatchedLessons++;
        if (!completed) allDone = false;
      }
      if (allDone && chapterVideos.length > 0) centreCompletedChapters++;
    }

    const centreMastery = { mastery: 0, proficient: 0, developing: 0, needs_practice: 0 };
    let centreBestQuiz: number | null = null;
    let centreQuizScoreSum = 0;
    for (const q of centreQuizzes) {
      const level = q.mastery_level as keyof typeof centreMastery;
      if (level in centreMastery) centreMastery[level]++;
      centreQuizScoreSum += q.percent;
      if (centreBestQuiz === null || q.percent > centreBestQuiz) centreBestQuiz = q.percent;
    }

    const lastActivity = centreProgress.reduce<string | null>(
      (latest, p) => (!latest || p.last_watched_at > latest ? p.last_watched_at : latest), null
    );

    return {
      id: centre.id,
      name: centre.name,
      orgName: org?.name ?? "—",
      mode: (centre.mode as "online" | "offline") ?? "online",
      location: centre.location,
      learnerCount: centreLearners.length,
      activeLearners: centreActive.size,
      totalChapters: centreTotalChapters,
      completedChapters: centreCompletedChapters,
      completionRate: centreTotalChapters > 0 ? Math.round((centreCompletedChapters / centreTotalChapters) * 100) : 0,
      totalLessons: centreTotalLessons,
      watchedLessons: centreWatchedLessons,
      quizAttempts: centreQuizzes.length,
      avgQuizScore: centreQuizzes.length > 0 ? Math.round(centreQuizScoreSum / centreQuizzes.length) : null,
      bestQuizScore: centreBestQuiz,
      masteryDistribution: centreMastery,
      lastActivityAt: lastActivity,
      lastSyncAt: lastActivity, // For offline centres, this is the last synced data
    };
  });

  centreStats.sort((a, b) => b.completionRate - a.completionRate);

  // ─── Subject Stats (when drilled into a centre or class) ───

  let subjectStats: SubjectStats[] | undefined;
  if (options?.centreId || options?.classNum !== undefined) {
    const subjectMap = new Map<string, { id: string; name: string; order: number; chapters: typeof chapterList }>();
    for (const chapter of chapterList) {
      const subj = chapter.subjects as unknown as { id: string; name: string; display_order: number } | null;
      if (!subj) continue;
      const existing = subjectMap.get(subj.id) ?? { id: subj.id, name: subj.name, order: subj.display_order, chapters: [] };
      existing.chapters.push(chapter);
      subjectMap.set(subj.id, existing);
    }

    subjectStats = Array.from(subjectMap.values())
      .sort((a, b) => a.order - b.order)
      .map((subj) => {
        let totalChaps = 0;
        let completedChaps = 0;
        let totalLessons = 0;
        let watched = 0;

        for (const chapter of subj.chapters) {
          const vids = videosByChapter.get(chapter.id) ?? [];
          if (vids.length === 0) continue;
          totalChaps++;
          totalLessons += vids.length;

          let allDone = true;
          for (const v of vids) {
            if (progressRows.some((p) => p.video_id === v.id && p.watched_percentage > 0)) watched++;
            if (!progressRows.some((p) => p.video_id === v.id && p.completed)) allDone = false;
          }
          if (allDone) completedChaps++;
        }

        const subjQuizIds = subj.chapters.map((c) => chapterToQuiz.get(c.id)).filter(Boolean) as string[];
        const subjQuizAttempts = quizRows.filter((q) => subjQuizIds.includes(q.quiz_id));
        const best = subjQuizAttempts.length > 0 ? Math.max(...subjQuizAttempts.map((q) => q.percent)) : null;

        return {
          id: subj.id,
          name: subj.name,
          totalChapters: totalChaps,
          completedChapters: completedChaps,
          completionRate: totalChaps > 0 ? Math.round((completedChaps / totalChaps) * 100) : 0,
          totalLessons,
          watchedLessons: watched,
          quizAttempts: subjQuizAttempts.length,
          bestQuizScore: best,
        };
      });
  }

  // ─── Chapter Stats (when drilled into a subject) ───

  let chapterStats: ChapterStats[] | undefined;
  if (options?.subjectId) {
    chapterStats = chapterList
      .sort((a, b) => a.chapter_no - b.chapter_no)
      .map((chapter) => {
        const vids = (videosByChapter.get(chapter.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
        const quizId = chapterToQuiz.get(chapter.id);
        const chapterQuizAttempts = quizId ? quizRows.filter((q) => q.quiz_id === quizId) : [];
        const best = chapterQuizAttempts.length > 0 ? Math.max(...chapterQuizAttempts.map((q) => q.percent)) : null;

        let completedCount = 0;
        const lessons: LessonStats[] = vids.map((v) => {
          const progress = progressRows.find((p) => p.video_id === v.id);
          const completed = progress?.completed ?? false;
          if (completed) completedCount++;
          return {
            id: v.id,
            title: v.title,
            sortOrder: v.sort_order,
            durationSeconds: v.duration_seconds,
            watchedPercentage: progress?.watched_percentage ?? 0,
            completed,
            lastWatchedAt: progress?.last_watched_at ?? null,
          };
        });

        return {
          id: chapter.id,
          chapterNo: chapter.chapter_no,
          title: chapter.title,
          totalLessons: vids.length,
          completedLessons: completedCount,
          isComplete: vids.length > 0 && completedCount === vids.length,
          quizAttempts: chapterQuizAttempts.length,
          bestQuizScore: best,
          lessons,
        };
      });
  }

  // ─── Build scope label ───
  let scopeLabel = "All Centres";
  if (options?.centreId) {
    const c = centreList.find((c) => c.id === options.centreId);
    scopeLabel = c?.name ?? "Centre";
  } else if (options?.orgId) {
    const org = centreList[0]?.organizations as unknown as { name: string } | null;
    scopeLabel = org?.name ?? "Organization";
  }

  return {
    totalLearners: learnerList.length,
    activeLearners: activeLearnerIds.size,
    totalChapters: trackableChapters.length,
    completedChapters: completedChapterIds.size,
    completionRate: trackableChapters.length > 0 ? Math.round((completedChapterIds.size / trackableChapters.length) * 100) : 0,
    totalQuizAttempts: quizRows.length,
    avgQuizScore: quizRows.length > 0 ? Math.round(quizScoreSum / quizRows.length) : null,
    bestQuizScore: bestQuiz,
    masteryDistribution: masteryDist,
    centres: centreStats,
    dailyActivity: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    subjects: subjectStats,
    chapters: chapterStats,
    generatedAt: now.toISOString(),
    scopeLabel,
  };
}
