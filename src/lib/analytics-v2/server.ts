"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/** Server action for client-side drill-down */
export async function loadImpactDashboardAction(options?: {
  orgId?: string;
  centreId?: string;
  classNum?: number;
  subjectId?: string;
}): Promise<ImpactDashboard> {
  return loadImpactDashboard(options);
}

// ─── Types ───

export type CentreSubjectBreakdown = {
  name: string;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  avgQuizScore: number | null;
};

export type CentreClassBreakdown = {
  classNum: number;
  label: string;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  avgQuizScore: number | null;
  subjects: CentreSubjectBreakdown[];
};

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
  subjectBreakdown: CentreSubjectBreakdown[];
  classBreakdown: CentreClassBreakdown[];
  lastActivityAt: string | null;
  lastSyncAt: string | null;
};

export type ClassStats = {
  classNum: number;
  label: string;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  totalLessons: number;
  watchedLessons: number;
  quizAttempts: number;
  avgQuizScore: number | null;
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

export type OrgStats = {
  id: string;
  name: string;
  type: string;
  centreCount: number;
  learnerCount: number;
  activeLearners: number;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  quizAttempts: number;
  avgQuizScore: number | null;
  lastActivityAt: string | null;
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
  // Organizations
  organizations: OrgStats[];
  // Centres
  centres: CentreStats[];
  // Timeline
  dailyActivity: DailyActivity[];
  // Drill-down data (optional)
  classes?: ClassStats[];
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
  // const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch centres
  let centreQuery = supabase
    .from("centres")
    .select("id, name, org_id, mode, location, offline_student_counts, organizations(name)")
    .eq("is_active", true);
  if (options?.orgId) centreQuery = centreQuery.eq("org_id", options.orgId);
  if (options?.centreId) centreQuery = centreQuery.eq("id", options.centreId);

  const { data: centres } = await centreQuery;
  const centreList = centres ?? [];
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
  const progressRows: Array<{
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
  const quizRows: Array<{
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

    // Per-centre subject breakdown
    const subjMap = new Map<string, { name: string; total: number; completed: number; quizAttempts: number; quizScoreSum: number }>();
    for (const chapter of trackableChapters) {
      const subj = chapter.subjects as unknown as { id: string; name: string; display_order: number } | null;
      if (!subj) continue;
      const entry = subjMap.get(subj.id) ?? { name: subj.name, total: 0, completed: 0, quizAttempts: 0, quizScoreSum: 0 };
      entry.total++;
      const chapterVids = videosByChapter.get(chapter.id) ?? [];
      let allVidsDone = true;
      for (const v of chapterVids) {
        if (!centreProgress.some((p) => p.video_id === v.id && p.completed)) allVidsDone = false;
      }
      if (allVidsDone && chapterVids.length > 0) entry.completed++;
      const qId = chapterToQuiz.get(chapter.id);
      if (qId) {
        const attempts = centreQuizzes.filter((q) => q.quiz_id === qId);
        entry.quizAttempts += attempts.length;
        entry.quizScoreSum += attempts.reduce((s, a) => s + a.percent, 0);
      }
      subjMap.set(subj.id, entry);
    }
    const subjectBreakdown: CentreSubjectBreakdown[] = Array.from(subjMap.values()).map((s) => ({
      name: s.name,
      totalChapters: s.total,
      completedChapters: s.completed,
      completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      avgQuizScore: s.quizAttempts > 0 ? Math.round(s.quizScoreSum / s.quizAttempts) : null,
    }));

    // Per-centre class → subject breakdown
    const classSubjMap = new Map<number, Map<string, { name: string; total: number; completed: number; quizAttempts: number; quizScoreSum: number }>>();
    for (const chapter of trackableChapters) {
      const subj = chapter.subjects as unknown as { id: string; name: string; display_order: number } | null;
      if (!subj) continue;
      const cls = chapter.class;
      if (!classSubjMap.has(cls)) classSubjMap.set(cls, new Map());
      const sMap = classSubjMap.get(cls)!;
      const entry = sMap.get(subj.id) ?? { name: subj.name, total: 0, completed: 0, quizAttempts: 0, quizScoreSum: 0 };
      entry.total++;
      const chVids = videosByChapter.get(chapter.id) ?? [];
      let allDone = true;
      for (const v of chVids) {
        if (!centreProgress.some((p) => p.video_id === v.id && p.completed)) allDone = false;
      }
      if (allDone && chVids.length > 0) entry.completed++;
      const qid = chapterToQuiz.get(chapter.id);
      if (qid) {
        const att = centreQuizzes.filter((q) => q.quiz_id === qid);
        entry.quizAttempts += att.length;
        entry.quizScoreSum += att.reduce((s, a) => s + a.percent, 0);
      }
      sMap.set(subj.id, entry);
    }
    const classBreakdown: CentreClassBreakdown[] = Array.from(classSubjMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([cls, sMap]) => {
        const subjects = Array.from(sMap.values()).map((s) => ({
          name: s.name,
          totalChapters: s.total,
          completedChapters: s.completed,
          completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
          avgQuizScore: s.quizAttempts > 0 ? Math.round(s.quizScoreSum / s.quizAttempts) : null,
        }));
        const total = subjects.reduce((s, sub) => s + sub.totalChapters, 0);
        const completed = subjects.reduce((s, sub) => s + sub.completedChapters, 0);
        const quizAtt = Array.from(sMap.values()).reduce((s, sub) => s + sub.quizAttempts, 0);
        const quizSum = Array.from(sMap.values()).reduce((s, sub) => s + sub.quizScoreSum, 0);
        return {
          classNum: cls,
          label: cls === 0 ? "KG" : `Class ${cls}`,
          totalChapters: total,
          completedChapters: completed,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          avgQuizScore: quizAtt > 0 ? Math.round(quizSum / quizAtt) : null,
          subjects,
        };
      });

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
      subjectBreakdown,
      classBreakdown,
      lastActivityAt: lastActivity,
      lastSyncAt: lastActivity, // For offline centres, this is the last synced data
    };
  });

  centreStats.sort((a, b) => b.completionRate - a.completionRate);

  // ─── Org Stats ───

  const orgMap = new Map<string, { id: string; name: string; type: string }>();
  for (const centre of centreList) {
    const org = centre.organizations as unknown as { name: string } | null;
    if (!orgMap.has(centre.org_id)) {
      orgMap.set(centre.org_id, { id: centre.org_id, name: org?.name ?? "—", type: "ngo" });
    }
  }

  // Also fetch org type
  const { data: orgRows } = await supabase.from("organizations").select("id, name, type").eq("is_active", true);
  for (const org of orgRows ?? []) {
    orgMap.set(org.id, { id: org.id, name: org.name, type: org.type });
  }

  const orgStats: OrgStats[] = Array.from(orgMap.values()).map((org) => {
    const orgCentres = centreStats.filter((c) => c.orgName === org.name || centreList.find((cl) => cl.id === c.id)?.org_id === org.id);
    const orgLearners = orgCentres.reduce((s, c) => s + c.learnerCount, 0);
    const orgActive = orgCentres.reduce((s, c) => s + c.activeLearners, 0);
    const orgCompleted = orgCentres.reduce((s, c) => s + c.completedChapters, 0);
    const orgTotal = orgCentres.length > 0 ? orgCentres[0].totalChapters : 0; // chapters are same across centres
    const orgQuizAttempts = orgCentres.reduce((s, c) => s + c.quizAttempts, 0);
    const orgQuizScoreSum = orgCentres.reduce((s, c) => s + (c.avgQuizScore ?? 0) * c.quizAttempts, 0);
    const orgLastActivity = orgCentres.reduce<string | null>(
      (latest, c) => (!latest || (c.lastActivityAt && c.lastActivityAt > latest)) ? c.lastActivityAt : latest, null
    );

    return {
      id: org.id,
      name: org.name,
      type: org.type,
      centreCount: orgCentres.length,
      learnerCount: orgLearners,
      activeLearners: orgActive,
      totalChapters: orgTotal,
      completedChapters: orgCompleted,
      completionRate: orgTotal > 0 ? Math.round((orgCompleted / orgTotal) * 100) : 0,
      quizAttempts: orgQuizAttempts,
      avgQuizScore: orgQuizAttempts > 0 ? Math.round(orgQuizScoreSum / orgQuizAttempts) : null,
      lastActivityAt: orgLastActivity,
    };
  });

  orgStats.sort((a, b) => b.completionRate - a.completionRate);

  // ─── Class Stats (when drilled into a centre) ───

  let classStats: ClassStats[] | undefined;
  if (options?.centreId && !options?.classNum && !options?.subjectId) {
    const classMap = new Map<number, { total: number; completed: number; lessons: number; watched: number; quizAttempts: number; quizScoreSum: number }>();

    for (const chapter of chapterList) {
      const vids = videosByChapter.get(chapter.id) ?? [];
      if (vids.length === 0) continue;
      const cls = chapter.class;
      const entry = classMap.get(cls) ?? { total: 0, completed: 0, lessons: 0, watched: 0, quizAttempts: 0, quizScoreSum: 0 };
      entry.total++;
      entry.lessons += vids.length;

      let allDone = true;
      for (const v of vids) {
        if (progressRows.some((p) => p.video_id === v.id && p.watched_percentage > 0)) entry.watched++;
        if (!progressRows.some((p) => p.video_id === v.id && p.completed)) allDone = false;
      }
      if (allDone) entry.completed++;

      const quizId = chapterToQuiz.get(chapter.id);
      if (quizId) {
        const attempts = quizRows.filter((q) => q.quiz_id === quizId);
        entry.quizAttempts += attempts.length;
        entry.quizScoreSum += attempts.reduce((s, a) => s + a.percent, 0);
      }

      classMap.set(cls, entry);
    }

    classStats = Array.from(classMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([cls, d]) => ({
        classNum: cls,
        label: cls === 0 ? "KG" : `Class ${cls}`,
        totalChapters: d.total,
        completedChapters: d.completed,
        completionRate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
        totalLessons: d.lessons,
        watchedLessons: d.watched,
        quizAttempts: d.quizAttempts,
        avgQuizScore: d.quizAttempts > 0 ? Math.round(d.quizScoreSum / d.quizAttempts) : null,
      }));
  }

  // ─── Subject Stats (when drilled into a centre or class) ───

  let subjectStats: SubjectStats[] | undefined;
  if (options?.classNum !== undefined) {
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
    organizations: orgStats,
    centres: centreStats,
    dailyActivity: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    classes: classStats,
    subjects: subjectStats,
    chapters: chapterStats,
    generatedAt: now.toISOString(),
    scopeLabel,
  };
}
