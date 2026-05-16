"use client";

import { useState, useTransition } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BookOpenCheck, Activity, Target, Award, ChevronRight, Wifi, WifiOff,
  CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import type {
  ImpactDashboard, CentreStats, SubjectStats, ChapterStats,
} from "@/lib/analytics-v2/server";
import { loadImpactDashboardAction } from "@/lib/analytics-v2/server";
import { generateImpactReport } from "@/lib/analytics-v2/pdf-report";

type DrillLevel = "platform" | "centre" | "subject";

type DrillState = {
  level: DrillLevel;
  centreId?: string;
  centreName?: string;
  subjectId?: string;
  subjectName?: string;
};

export function ImpactDashboardClient({ data: initialData, userName }: { data: ImpactDashboard; userName: string }) {
  const [data, setData] = useState(initialData);
  const [drill, setDrill] = useState<DrillState>({ level: "platform" });
  const [isPending, startTransition] = useTransition();

  function drillIntoCentre(centre: CentreStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ centreId: centre.id });
      setData(result);
      setDrill({ level: "centre", centreId: centre.id, centreName: centre.name });
    });
  }

  function drillIntoSubject(subject: SubjectStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ centreId: drill.centreId, subjectId: subject.id });
      setData(result);
      setDrill({ ...drill, level: "subject", subjectId: subject.id, subjectName: subject.name });
    });
  }

  function goBack(toLevel: DrillLevel) {
    startTransition(async () => {
      if (toLevel === "platform") {
        const result = await loadImpactDashboardAction();
        setData(result);
        setDrill({ level: "platform" });
      } else if (toLevel === "centre") {
        const result = await loadImpactDashboardAction({ centreId: drill.centreId });
        setData(result);
        setDrill({ level: "centre", centreId: drill.centreId, centreName: drill.centreName });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => goBack("platform")}
          className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "platform" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}
        >
          Overview
        </button>
        {drill.centreName && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <button
              type="button"
              onClick={() => goBack("centre")}
              className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "centre" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}
            >
              {drill.centreName}
            </button>
          </>
        )}
        {drill.subjectName && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <span className="rounded-full bg-orange-primary/10 px-3 py-1 font-medium text-orange-primary">
              {drill.subjectName}
            </span>
          </>
        )}
        {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin text-orange-primary" />}
      </div>

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-poppins text-2xl font-bold text-heading">Impact Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {data.scopeLabel} · Updated {new Date(data.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const orgName = data.centres[0]?.orgName ?? data.scopeLabel;
            const centreName = drill.centreName;
            generateImpactReport(data, userName, orgName, centreName);
          }}
          className="inline-flex items-center gap-2 rounded-clay-sm bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange transition hover:brightness-105"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Download Report
        </button>
      </div>

      {/* Level routing */}
      {drill.level === "platform" && (
        <PlatformView data={data} onSelectCentre={drillIntoCentre} />
      )}
      {drill.level === "centre" && data.subjects && (
        <CentreView
          centre={data.centres[0] ?? null}
          subjects={data.subjects}
          onSelectSubject={drillIntoSubject}
          data={data}
        />
      )}
      {drill.level === "subject" && data.chapters && (
        <SubjectView chapters={data.chapters} data={data} />
      )}
    </div>
  );
}

// ─── Level 1: Platform Overview ───

function PlatformView({ data, onSelectCentre }: { data: ImpactDashboard; onSelectCentre: (c: CentreStats) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Completed" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Activity className="h-6 w-6 text-emerald-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Active Learners (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Avg Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Daily Activity (30 days)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.dailyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" />
            <XAxis dataKey="date" tick={{ fill: "#7c6a58", fontSize: 11 }} tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
            <YAxis tick={{ fill: "#7c6a58", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#fff9f1", border: "1px solid #eadbc8", borderRadius: 12 }} />
            <Area type="monotone" dataKey="lessonsWatched" stroke="#E8871E" fill="#E8871E" fillOpacity={0.15} strokeWidth={2} name="Lessons Watched" />
            <Area type="monotone" dataKey="quizAttempts" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.1} strokeWidth={2} name="Quiz Attempts" />
          </AreaChart>
        </ResponsiveContainer>
      </ClayCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Quiz Mastery Distribution</h3>
          {data.totalQuizAttempts > 0 ? (
            <div className="space-y-3">
              <MasteryBar label="Mastery (90%+)" count={data.masteryDistribution.mastery} total={data.totalQuizAttempts} color="#22C55E" />
              <MasteryBar label="Proficient (70-89%)" count={data.masteryDistribution.proficient} total={data.totalQuizAttempts} color="#3B82F6" />
              <MasteryBar label="Developing (50-69%)" count={data.masteryDistribution.developing} total={data.totalQuizAttempts} color="#EAB308" />
              <MasteryBar label="Needs Practice (<50%)" count={data.masteryDistribution.needs_practice} total={data.totalQuizAttempts} color="#EF4444" />
            </div>
          ) : (
            <p className="text-sm text-muted">No quiz attempts yet.</p>
          )}
        </ClayCard>

        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-4 font-poppins text-lg font-bold text-heading">
            <AlertTriangle className="mr-2 inline h-5 w-5 text-amber-500" />
            Needs Attention
          </h3>
          <div className="space-y-3">
            {data.centres.filter((c) => c.completionRate < 30 && c.learnerCount > 0).length > 0 && (
              <p className="text-sm text-body">
                <span className="font-semibold text-amber-600">{data.centres.filter((c) => c.completionRate < 30 && c.learnerCount > 0).length}</span> centres below 30% completion
              </p>
            )}
            {data.activeLearners === 0 && data.totalLearners > 0 && (
              <p className="text-sm text-body">No active learners in the last 7 days</p>
            )}
            {data.totalQuizAttempts === 0 && (
              <p className="text-sm text-body">No quiz attempts recorded yet</p>
            )}
            {data.centres.filter((c) => c.completionRate >= 30 || c.learnerCount === 0).length === data.centres.length && data.activeLearners > 0 && data.totalQuizAttempts > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> All centres performing well
              </div>
            )}
          </div>
        </ClayCard>
      </div>

      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Centre Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-orange-primary/10 text-left">
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Centre</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Mode</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Learners</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Active 7d</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Chapters</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Quiz Avg</th>
                <th className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {data.centres.map((centre) => (
                <tr
                  key={centre.id}
                  className="cursor-pointer border-b border-orange-primary/5 transition hover:bg-orange-50/40"
                  onClick={() => onSelectCentre(centre)}
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-heading">{centre.name}</p>
                    <p className="text-xs text-muted">{centre.orgName}</p>
                  </td>
                  <td className="py-3 pr-4">
                    {centre.mode === "offline" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><WifiOff className="h-3 w-3" /> Offline</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"><Wifi className="h-3 w-3" /> Online</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium">{centre.learnerCount}</td>
                  <td className="py-3 pr-4 text-right font-medium text-emerald-600">{centre.activeLearners}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-orange-primary/10">
                        <div className="h-full rounded-full bg-orange-primary" style={{ width: `${centre.completionRate}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-heading">{centre.completionRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right text-xs">{centre.completedChapters}/{centre.totalChapters}</td>
                  <td className="py-3 pr-4 text-right text-xs">{centre.avgQuizScore != null ? `${centre.avgQuizScore}%` : "—"}</td>
                  <td className="py-3 text-right text-xs text-muted">
                    {centre.lastActivityAt ? new Date(centre.lastActivityAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ClayCard>
    </>
  );
}

// ─── Level 2: Centre View ───

function CentreView({ centre, subjects, onSelectSubject, data }: {
  centre: CentreStats | null;
  subjects: SubjectStats[];
  onSelectSubject: (s: SubjectStats) => void;
  data: ImpactDashboard;
}) {
  return (
    <>
      {centre && (
        <div className="flex items-center gap-3">
          {centre.mode === "offline" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Offline</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"><Wifi className="h-3.5 w-3.5" /> Online</span>
          )}
          {centre.lastSyncAt && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Last sync: {new Date(centre.lastSyncAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Done" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Target className="h-6 w-6 text-blue-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Learners Active (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Subject-wise Progress</h3>
        <div className="space-y-3">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex cursor-pointer items-center gap-4 rounded-clay border border-orange-primary/10 bg-white/80 px-4 py-3 transition hover:border-orange-primary/20 hover:bg-orange-50/40"
              onClick={() => onSelectSubject(subject)}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-heading">{subject.name}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-orange-primary/10">
                  <div className="h-full rounded-full" style={{ width: `${subject.completionRate}%`, background: subject.completionRate === 100 ? "#22C55E" : "#E8871E" }} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-6 text-center text-xs">
                <div><p className="font-bold text-heading">{subject.completedChapters}/{subject.totalChapters}</p><p className="text-muted">Chapters</p></div>
                <div><p className="font-bold" style={{ color: subject.completionRate === 100 ? "#22C55E" : "#E8871E" }}>{subject.completionRate}%</p><p className="text-muted">Complete</p></div>
                <div><p className="font-bold text-heading">{subject.quizAttempts}</p><p className="text-muted">Attempts</p></div>
                <div><p className="font-bold" style={{ color: (subject.bestQuizScore ?? 0) >= 80 ? "#22C55E" : (subject.bestQuizScore ?? 0) >= 50 ? "#E8871E" : "#EF4444" }}>{subject.bestQuizScore != null ? `${subject.bestQuizScore}%` : "—"}</p><p className="text-muted">Best Score</p></div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </div>
          ))}
          {subjects.length === 0 && <p className="text-sm text-muted">No subject data available for this centre.</p>}
        </div>
      </ClayCard>
    </>
  );
}

// ─── Level 3: Subject/Chapter View ───

function SubjectView({ chapters, data }: { chapters: ChapterStats[]; data: ImpactDashboard }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Done" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Target className="h-6 w-6 text-blue-600" />} value={`${chapters.reduce((s, c) => s + c.completedLessons, 0)}/${chapters.reduce((s, c) => s + c.totalLessons, 0)}`} label="Lessons Watched" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.bestQuizScore != null ? `${data.bestQuizScore}%` : "—"} label={`Best Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Chapter Progress</h3>
        <div className="space-y-4">
          {chapters.map((chapter) => (
            <div key={chapter.id} className="rounded-clay border border-orange-primary/10 bg-white/80 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${chapter.isComplete ? "bg-emerald-100 text-emerald-600" : "bg-orange-50 text-orange-primary"}`}>
                  {chapter.isComplete ? "✓" : chapter.chapterNo}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-heading">{chapter.title}</p>
                  <p className="text-xs text-muted">
                    {chapter.completedLessons}/{chapter.totalLessons} lessons
                    {chapter.quizAttempts > 0 && ` · ${chapter.quizAttempts} quiz attempt${chapter.quizAttempts > 1 ? "s" : ""}`}
                    {chapter.bestQuizScore != null && ` · Best: ${chapter.bestQuizScore}%`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chapter.isComplete ? "bg-emerald-100 text-emerald-700" : chapter.completedLessons > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  {chapter.isComplete ? "Complete" : chapter.completedLessons > 0 ? "In Progress" : "Not Started"}
                </span>
              </div>
              {chapter.lessons.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {chapter.lessons.map((lesson) => (
                    <div key={lesson.id} className={`rounded-lg border px-3 py-2 text-xs ${lesson.completed ? "border-emerald-200 bg-emerald-50/50" : lesson.watchedPercentage > 0 ? "border-orange-200 bg-orange-50/50" : "border-slate-100"}`}>
                      <p className="font-medium text-heading truncate">{lesson.title}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted">{Math.floor(lesson.durationSeconds / 60)}:{String(lesson.durationSeconds % 60).padStart(2, "0")}</span>
                        {lesson.completed ? (
                          <span className="text-emerald-600 font-semibold">Done</span>
                        ) : lesson.watchedPercentage > 0 ? (
                          <span className="text-orange-primary font-semibold">{lesson.watchedPercentage}%</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ClayCard>
    </>
  );
}

// ─── Shared Components ───

function MetricCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <ClayCard hover={false} className="!p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-clay-sm clay-surface shadow-clay-pill">{icon}</div>
        <div>
          {value && <p className="text-2xl font-bold text-heading">{value}</p>}
          <p className="text-xs text-muted">{label}</p>
        </div>
      </div>
    </ClayCard>
  );
}

function MasteryBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-xs text-body">{label}</div>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-12 text-right text-xs font-semibold text-heading">{count} ({pct}%)</div>
    </div>
  );
}
