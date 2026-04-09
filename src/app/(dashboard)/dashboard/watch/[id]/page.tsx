import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageBreadcrumbs } from "@/components/dashboard/page-breadcrumbs";
import { VideoPlayer } from "@/components/video/video-player";
import { ChapterPlaylist } from "@/components/video/chapter-playlist";
import { ClayCard } from "@/components/ui/clay-card";
import {
  getQuizMasteryClasses,
  getQuizMasteryLabel,
  getQuizMasteryLevel,
  isQuizSchemaUnavailableError,
} from "@/lib/quiz";
import { getFallbackQuizMeta, listFallbackAttemptsForUser } from "@/lib/dev-quiz-fallback";

export default async function WatchPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  // Get user's medium preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("medium")
    .eq("id", userId)
    .single();

  const isHindi = profile?.medium === "Hindi";

  // Get the video with its chapter
  const { data: video } = await supabase
    .from("videos")
    .select("id, title, title_hindi, s3_key, s3_key_hindi, duration_seconds, duration_seconds_hindi, chapter_id, sort_order")
    .eq("id", params.id)
    .single();

  if (!video) redirect("/dashboard");

  // Use Hindi variants when available and user's medium is Hindi
  const videoTitle = (isHindi && video.title_hindi) ? video.title_hindi : video.title;
  const videoS3Key = (isHindi && video.s3_key_hindi) ? video.s3_key_hindi : video.s3_key;
  const videoDuration = (isHindi && video.duration_seconds_hindi) ? video.duration_seconds_hindi : video.duration_seconds;

  // Get chapter info
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, title_hindi, chapter_no, class, medium, subject_id, subjects(id, name)")
    .eq("id", video.chapter_id)
    .single();

  if (!chapter) redirect("/dashboard");

  // Get all videos in this chapter (for playlist)
  const { data: chapterVideos } = await supabase
    .from("videos")
    .select("id, title, title_hindi, duration_seconds, duration_seconds_hindi, sort_order")
    .eq("chapter_id", chapter.id)
    .order("sort_order");

  // Get progress for all chapter videos
  const chapterVideoIds = chapterVideos?.map((v) => v.id) ?? [];
  const { data: progressData } = chapterVideoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position")
        .eq("user_id", userId)
        .in("video_id", chapterVideoIds)
    : { data: [] };

  const progressMap = new Map(progressData?.map((p) => [p.video_id, p]) ?? []);
  const currentProgress = progressMap.get(video.id);

  const subjectMeta = chapter.subjects as unknown as { id: string; name: string } | null;
  const subjectName = subjectMeta?.name ?? "";
  const subjectId = subjectMeta?.id ?? "";

  const { data: quiz, error: quizError } = await supabase
    .from("chapter_quizzes")
    .select("id, question_count")
    .eq("chapter_id", chapter.id)
    .eq("is_published", true)
    .maybeSingle();
  const activeQuiz = isQuizSchemaUnavailableError(quizError) ? null : quiz;
  const fallbackQuiz = !activeQuiz
    ? await getFallbackQuizMeta({
        id: chapter.id,
        class: chapter.class,
        medium: chapter.medium,
        chapterNo: chapter.chapter_no,
        title: chapter.title,
        titleHindi: chapter.title_hindi,
        subjectName,
      })
    : null;

  const { data: quizAttempts, error: quizAttemptsError } = activeQuiz
    ? await supabase
        .from("quiz_attempts")
        .select("percent, correct_answers, total_questions, completed_at")
        .eq("quiz_id", activeQuiz.id)
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
    : { data: [] };
  const fallbackAttemptRows = !activeQuiz && fallbackQuiz ? await listFallbackAttemptsForUser(userId, chapter.id) : [];
  const quizAttemptRows = isQuizSchemaUnavailableError(quizAttemptsError)
    ? fallbackAttemptRows.map((attempt) => ({
        percent: attempt.percent,
        correct_answers: attempt.correctAnswers,
        total_questions: attempt.totalQuestions,
        completed_at: attempt.completedAt,
      }))
    : quizAttempts ?? [];

  let bestAttempt: (typeof quizAttemptRows)[number] | null = null;
  for (const attempt of quizAttemptRows) {
    if (
      !bestAttempt ||
      attempt.percent > bestAttempt.percent ||
      (attempt.percent === bestAttempt.percent && attempt.completed_at > bestAttempt.completed_at)
    ) {
      bestAttempt = attempt;
    }
  }

  const playlistVideos = (chapterVideos ?? []).map((v) => ({
    id: v.id,
    title: (isHindi && v.title_hindi) ? v.title_hindi : v.title,
    durationSeconds: (isHindi && v.duration_seconds_hindi) ? v.duration_seconds_hindi : v.duration_seconds,
    completed: progressMap.get(v.id)?.completed ?? false,
    watchedPercentage: progressMap.get(v.id)?.watched_percentage ?? 0,
  }));

  const activeIndex = playlistVideos.findIndex((item) => item.id === video.id);
  const nextVideo = activeIndex >= 0 && activeIndex < playlistVideos.length - 1
    ? playlistVideos[activeIndex + 1]
    : null;

  return (
    <div>
      <PageBreadcrumbs
        backHref={`/dashboard/chapters/${chapter.id}`}
        backLabel="Back to Chapter"
        crumbs={[
          { href: "/dashboard/subjects", label: "Subjects" },
          ...(subjectId ? [{ href: `/dashboard/subjects/${subjectId}`, label: subjectName }] : []),
          { href: `/dashboard/chapters/${chapter.id}`, label: `Ch. ${chapter.chapter_no}` },
          { href: `/dashboard/watch/${video.id}`, label: videoTitle },
        ]}
      />

      <div className="flex flex-col gap-6 -mt-2 lg:flex-row">
      {/* Video Player */}
      <div className="min-w-0 flex-1">
        <VideoPlayer
          videoId={video.id}
          s3Key={videoS3Key}
          initialPosition={currentProgress?.last_position ?? 0}
          durationSeconds={videoDuration}
          nextVideoId={nextVideo?.id ?? null}
          nextVideoTitle={nextVideo?.title ?? null}
        />
        <div className="mt-4">
          <h1 className="text-xl font-bold text-heading font-poppins">{videoTitle}</h1>
          <p className="text-sm text-muted mt-1">
            {subjectName} · Ch. {chapter.chapter_no}: {chapter.title}
          </p>
        </div>

        {activeQuiz || fallbackQuiz ? (
          <div className="mt-5">
            <ClayCard hover={false} className="!p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-primary">Take Quiz</p>
                  <h2 className="mt-2 text-lg font-bold text-heading font-poppins">
                    Test this chapter right after watching
                  </h2>
                  <p className="mt-1 text-sm text-body">
                    {(activeQuiz?.question_count ?? fallbackQuiz?.questionCount ?? 0)} questions available for Chapter{" "}
                    {chapter.chapter_no}.
                  </p>
                  {bestAttempt ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getQuizMasteryClasses(
                          getQuizMasteryLevel(bestAttempt.percent)
                        )}`}
                      >
                        {getQuizMasteryLabel(getQuizMasteryLevel(bestAttempt.percent))}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                        Best score: {bestAttempt.percent}% · {bestAttempt.correct_answers}/{bestAttempt.total_questions}
                      </span>
                    </div>
                  ) : null}
                </div>

                <Link
                  href={`/dashboard/chapters/${chapter.id}/quiz`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange"
                >
                  {bestAttempt ? "Retake quiz" : "Start quiz"}
                </Link>
              </div>
            </ClayCard>
          </div>
        ) : null}
      </div>

      {/* Playlist Sidebar */}
      <div className="w-full shrink-0 lg:hidden">
        <ChapterPlaylist
          chapterTitle={chapter.title}
          chapterNo={chapter.chapter_no}
          subjectName={subjectName}
          videos={playlistVideos}
          activeVideoId={video.id}
        />
      </div>

      <div className="hidden w-80 shrink-0 lg:block">
        <ChapterPlaylist
          chapterTitle={chapter.title}
          chapterNo={chapter.chapter_no}
          subjectName={subjectName}
          videos={playlistVideos}
          activeVideoId={video.id}
        />
      </div>
      </div>
    </div>
  );
}
