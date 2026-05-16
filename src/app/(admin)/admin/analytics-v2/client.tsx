"use client";

import { useState, useTransition } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
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

// ─── Chart Colors ───

const CHART_ORANGE = "#E8871E";
const CHART_GREEN = "#22C55E";
const CHART_BLUE = "#3B82F6";
const CHART_PURPLE = "#8B5CF6";
const CHART_YELLOW = "#EAB308";
const CHART_RED = "#EF4444";
const CHART_SLATE = "#94A3B8";

const MASTERY_COLORS = [CHART_GREEN, CHART_BLUE, CHART_YELLOW, CHART_RED];

const TOOLTIP_STYLE = { background: "#fff9f1", border: "1px solid #eadbc8", borderRadius: 12, fontSize: 12 };

type ComparisonMetric = "learners" | "active" | "completion" | "quiz";

// ─── Drill Types ───

type DrillLevel = "platform" | "org" | "centre" | "class" | "subject";

type DrillState = {
  level: DrillLevel;
  orgId?: string;
  orgName?: string;
  centreId?: string;
  centreName?: string;
  classNum?: number;
  className?: string;
  subjectId?: string;
  subjectName?: string;
};

// ─── Reusable: Metric Switcher ───

function MetricSwitcher({ value, onChange }: { value: ComparisonMetric; onChange: (v: ComparisonMetric) => void }) {
  const options: { key: ComparisonMetric; label: string }[] = [
    { key: "learners", label: "Learners" },
    { key: "active", label: "Active 7d" },
    { key: "completion", label: "Completion %" },
    { key: "quiz", label: "Quiz Score" },
  ];
  return (
    <div className="flex gap-1 rounded-full bg-orange-primary/5 p-1">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${value === o.key ? "bg-orange-primary text-white shadow-sm" : "text-muted hover:text-heading"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Reusable: Mode Filter ───

function ModeFilter({ value, onChange }: { value: "all" | "online" | "offline"; onChange: (v: "all" | "online" | "offline") => void }) {
  const options: { key: "all" | "online" | "offline"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "online", label: "Online" },
    { key: "offline", label: "Offline" },
  ];
  return (
    <div className="flex gap-1 rounded-full bg-orange-primary/5 p-1">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${value === o.key ? "bg-orange-primary text-white shadow-sm" : "text-muted hover:text-heading"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Reusable: Mastery Donut ───

function MasteryDonut({ distribution, total }: { distribution: { mastery: number; proficient: number; developing: number; needs_practice: number }; total: number }) {
  if (total === 0) return <p className="py-8 text-center text-sm text-muted">No quiz attempts yet</p>;
  const pieData = [
    { name: "Mastery (90%+)", value: distribution.mastery },
    { name: "Proficient (70-89%)", value: distribution.proficient },
    { name: "Developing (50-69%)", value: distribution.developing },
    { name: "Needs Practice (<50%)", value: distribution.needs_practice },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? "").split(" ")[0]} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
          {pieData.map((_, i) => <Cell key={i} fill={MASTERY_COLORS[i]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Reusable: Comparison Bar Chart ───

function ComparisonBars({ items, metric }: { items: { name: string; learners: number; active: number; completion: number; quiz: number }[]; metric: ComparisonMetric }) {
  const config: Record<ComparisonMetric, { key: string; color: string; suffix: string }> = {
    learners: { key: "learners", color: CHART_ORANGE, suffix: "" },
    active: { key: "active", color: CHART_GREEN, suffix: "" },
    completion: { key: "completion", color: CHART_BLUE, suffix: "%" },
    quiz: { key: "quiz", color: CHART_PURPLE, suffix: "%" },
  };
  const c = config[metric];
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted">No data available</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(items.length * 36, 120)}>
      <BarChart data={items} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} domain={metric === "completion" || metric === "quiz" ? [0, 100] : undefined} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#2D2117", fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}${c.suffix}`} />
        <Bar dataKey={c.key} fill={c.color} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Reusable: Activity Trend ───

function ActivityTrend({ dailyActivity }: { dailyActivity: ImpactDashboard["dailyActivity"] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dailyActivity}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" />
        <XAxis dataKey="date" tick={{ fill: "#7c6a58", fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
        <YAxis tick={{ fill: "#7c6a58", fontSize: 10 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area type="monotone" dataKey="lessonsWatched" stroke={CHART_ORANGE} fill={CHART_ORANGE} fillOpacity={0.15} strokeWidth={2} name="Lessons" />
        <Area type="monotone" dataKey="quizAttempts" stroke={CHART_PURPLE} fill={CHART_PURPLE} fillOpacity={0.1} strokeWidth={2} name="Quizzes" />
        <Area type="monotone" dataKey="chaptersCompleted" stroke={CHART_GREEN} fill={CHART_GREEN} fillOpacity={0.1} strokeWidth={2} name="Chapters" />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export function ImpactDashboardClient({ data: initialData, userName }: { data: ImpactDashboard; userName: string }) {
  const [data, setData] = useState(initialData);
  const [drill, setDrill] = useState<DrillState>({ level: "platform" });
  const [isPending, startTransition] = useTransition();

  function drillIntoOrg(org: import("@/lib/analytics-v2/server").OrgStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ orgId: org.id });
      setData(result);
      setDrill({ level: "org", orgId: org.id, orgName: org.name });
    });
  }

  function drillIntoCentre(centre: CentreStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ centreId: centre.id });
      setData(result);
      setDrill({ ...drill, level: "centre", centreId: centre.id, centreName: centre.name });
    });
  }

  function drillIntoClass(cls: import("@/lib/analytics-v2/server").ClassStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ centreId: drill.centreId, classNum: cls.classNum });
      setData(result);
      setDrill({ ...drill, level: "class", classNum: cls.classNum, className: cls.label });
    });
  }

  function drillIntoSubject(subject: SubjectStats) {
    startTransition(async () => {
      const result = await loadImpactDashboardAction({ centreId: drill.centreId, classNum: drill.classNum, subjectId: subject.id });
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
      } else if (toLevel === "org") {
        const result = await loadImpactDashboardAction({ orgId: drill.orgId });
        setData(result);
        setDrill({ level: "org", orgId: drill.orgId, orgName: drill.orgName });
      } else if (toLevel === "centre") {
        const result = await loadImpactDashboardAction({ centreId: drill.centreId });
        setData(result);
        setDrill({ level: "centre", orgId: drill.orgId, orgName: drill.orgName, centreId: drill.centreId, centreName: drill.centreName });
      } else if (toLevel === "class") {
        const result = await loadImpactDashboardAction({ centreId: drill.centreId, classNum: drill.classNum });
        setData(result);
        setDrill({ ...drill, level: "class", subjectId: undefined, subjectName: undefined });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => goBack("platform")}
          className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "platform" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}>
          Overview
        </button>
        {drill.orgName && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <button type="button" onClick={() => goBack("org")}
              className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "org" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}>
              {drill.orgName}
            </button>
          </>
        )}
        {drill.centreName && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <button type="button" onClick={() => goBack("centre")}
              className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "centre" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}>
              {drill.centreName}
            </button>
          </>
        )}
        {drill.className && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <button type="button" onClick={() => goBack("class")}
              className={`rounded-full px-3 py-1 font-medium transition ${drill.level === "class" ? "bg-orange-primary/10 text-orange-primary" : "text-muted hover:text-heading"}`}>
              {drill.className}
            </button>
          </>
        )}
        {drill.subjectName && (
          <>
            <ChevronRight className="h-4 w-4 text-muted" />
            <span className="rounded-full bg-orange-primary/10 px-3 py-1 font-medium text-orange-primary">{drill.subjectName}</span>
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
          onClick={async () => {
            if (drill.level === "platform") {
              const reportData = await loadImpactDashboardAction();
              await generateImpactReport(reportData, userName, "All Organizations", undefined, "platform");
            } else {
              const orgId = drill.orgId ?? data.organizations[0]?.id;
              const reportData = orgId ? await loadImpactDashboardAction({ orgId }) : data;
              const orgName = drill.orgName ?? data.organizations[0]?.name ?? data.scopeLabel;
              await generateImpactReport(reportData, userName, orgName, drill.centreName, "org");
            }
          }}
          className="inline-flex items-center gap-2 rounded-clay-sm bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange transition hover:brightness-105"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Download Report
        </button>
      </div>

      {/* Level routing */}
      {drill.level === "platform" && <PlatformView data={data} onSelectOrg={drillIntoOrg} />}
      {drill.level === "org" && <OrgView data={data} onSelectCentre={drillIntoCentre} />}
      {drill.level === "centre" && data.classes && (
        <CentreView centre={data.centres[0] ?? null} classes={data.classes} onSelectClass={drillIntoClass} data={data} />
      )}
      {drill.level === "class" && data.subjects && (
        <ClassView subjects={data.subjects} onSelectSubject={drillIntoSubject} data={data} />
      )}
      {drill.level === "subject" && data.chapters && <SubjectView chapters={data.chapters} data={data} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// PLATFORM VIEW — 5 charts
// ═══════════════════════════════════════════

function PlatformView({ data, onSelectOrg }: { data: ImpactDashboard; onSelectOrg: (o: import("@/lib/analytics-v2/server").OrgStats) => void }) {
  const [metric, setMetric] = useState<ComparisonMetric>("completion");

  const orgBarData = data.organizations.map((o) => ({
    name: o.name.length > 18 ? o.name.slice(0, 17) + "…" : o.name,
    learners: o.learnerCount,
    active: o.activeLearners,
    completion: o.completionRate,
    quiz: o.avgQuizScore ?? 0,
  }));

  // Centre mode split
  const onlineCentres = data.centres.filter((c) => c.mode === "online");
  const offlineCentres = data.centres.filter((c) => c.mode === "offline");
  const modePie = [
    { name: "Online", value: onlineCentres.length, color: CHART_GREEN },
    { name: "Offline", value: offlineCentres.length, color: CHART_YELLOW },
  ].filter((d) => d.value > 0);

  // Learner distribution across orgs
  const learnerDistData = data.organizations
    .sort((a, b) => b.learnerCount - a.learnerCount)
    .slice(0, 10)
    .map((o) => ({ name: o.name.length > 18 ? o.name.slice(0, 17) + "…" : o.name, count: o.learnerCount }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Completed" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Activity className="h-6 w-6 text-emerald-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Active Learners (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Avg Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      {/* Chart 1: Activity Trend */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Daily Activity (30 days)</h3>
        <ActivityTrend dailyActivity={data.dailyActivity} />
      </ClayCard>

      {/* Chart 2: Org Comparison + metric switcher */}
      <ClayCard hover={false} className="!p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-poppins text-lg font-bold text-heading">Organization Comparison</h3>
          <MetricSwitcher value={metric} onChange={setMetric} />
        </div>
        <ComparisonBars items={orgBarData} metric={metric} />
      </ClayCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 3: Mastery Donut */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Quiz Mastery Distribution</h3>
          <MasteryDonut distribution={data.masteryDistribution} total={data.totalQuizAttempts} />
        </ClayCard>

        {/* Chart 4: Learner Distribution */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Learner Distribution</h3>
          {learnerDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={learnerDistData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill={CHART_ORANGE} radius={[0, 6, 6, 0]} barSize={14} name="Learners" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>
      </div>

      {/* Chart 5: Centre Mode Split */}
      {modePie.length > 1 && (
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Centre Mode Split</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={modePie} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} style={{ fontSize: 11 }}>
                    {modePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <div className="rounded-clay bg-green-50 px-4 py-3">
                <p className="text-2xl font-bold text-green-700">{onlineCentres.length}</p>
                <p className="text-xs text-muted">Online Centres · {onlineCentres.reduce((s, c) => s + c.learnerCount, 0)} learners</p>
              </div>
              <div className="rounded-clay bg-amber-50 px-4 py-3">
                <p className="text-2xl font-bold text-amber-700">{offlineCentres.length}</p>
                <p className="text-xs text-muted">Offline Centres · {offlineCentres.reduce((s, c) => s + c.learnerCount, 0)} learners</p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-2 text-xs">
              <div className="flex items-center justify-between"><span className="text-muted">Online Completion</span><span className="font-bold">{onlineCentres.length > 0 ? Math.round(onlineCentres.reduce((s, c) => s + c.completionRate, 0) / onlineCentres.length) : 0}%</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Offline Completion</span><span className="font-bold">{offlineCentres.length > 0 ? Math.round(offlineCentres.reduce((s, c) => s + c.completionRate, 0) / offlineCentres.length) : 0}%</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Online Quiz Avg</span><span className="font-bold">{onlineCentres.filter((c) => c.avgQuizScore != null).length > 0 ? Math.round(onlineCentres.filter((c) => c.avgQuizScore != null).reduce((s, c) => s + (c.avgQuizScore ?? 0), 0) / onlineCentres.filter((c) => c.avgQuizScore != null).length) : "—"}%</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Offline Quiz Avg</span><span className="font-bold">{offlineCentres.filter((c) => c.avgQuizScore != null).length > 0 ? Math.round(offlineCentres.filter((c) => c.avgQuizScore != null).reduce((s, c) => s + (c.avgQuizScore ?? 0), 0) / offlineCentres.filter((c) => c.avgQuizScore != null).length) : "—"}%</span></div>
            </div>
          </div>
        </ClayCard>
      )}

      {/* Needs Attention */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading"><AlertTriangle className="mr-2 inline h-5 w-5 text-amber-500" />Needs Attention</h3>
        <div className="space-y-2 text-sm">
          {data.centres.filter((c) => c.completionRate < 30 && c.learnerCount > 0).length > 0 && (
            <p><span className="font-semibold text-amber-600">{data.centres.filter((c) => c.completionRate < 30 && c.learnerCount > 0).length}</span> centres below 30% completion</p>
          )}
          {data.activeLearners === 0 && data.totalLearners > 0 && <p>No active learners in the last 7 days</p>}
          {data.totalQuizAttempts === 0 && <p>No quiz attempts recorded yet</p>}
          {data.centres.filter((c) => c.completionRate >= 30 || c.learnerCount === 0).length === data.centres.length && data.activeLearners > 0 && data.totalQuizAttempts > 0 && (
            <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> All centres performing well</div>
          )}
        </div>
      </ClayCard>

      {/* Organization Table */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Organization Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-orange-primary/10 text-left">
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Organization</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Centres</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Learners</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Active 7d</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Chapters</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Quiz Avg</th>
                <th className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-muted text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {data.organizations.map((org) => (
                <tr key={org.id} className="cursor-pointer border-b border-orange-primary/5 transition hover:bg-orange-50/40" onClick={() => onSelectOrg(org)}>
                  <td className="py-3 pr-4"><p className="font-semibold text-heading">{org.name}</p><p className="text-xs text-muted uppercase">{org.type}</p></td>
                  <td className="py-3 pr-4 text-right font-medium">{org.centreCount}</td>
                  <td className="py-3 pr-4 text-right font-medium">{org.learnerCount}</td>
                  <td className="py-3 pr-4 text-right font-medium text-emerald-600">{org.activeLearners}</td>
                  <td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-orange-primary/10"><div className="h-full rounded-full bg-orange-primary" style={{ width: `${org.completionRate}%` }} /></div><span className="text-xs font-semibold">{org.completionRate}%</span></div></td>
                  <td className="py-3 pr-4 text-right text-xs">{org.completedChapters}/{org.totalChapters}</td>
                  <td className="py-3 pr-4 text-right text-xs">{org.avgQuizScore != null ? `${org.avgQuizScore}%` : "—"}</td>
                  <td className="py-3 text-right text-xs text-muted">{org.lastActivityAt ? new Date(org.lastActivityAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ClayCard>
    </>
  );
}

// ═══════════════════════════════════════════
// ORG VIEW — 5 charts + mode filter
// ═══════════════════════════════════════════

function OrgView({ data, onSelectCentre }: { data: ImpactDashboard; onSelectCentre: (c: CentreStats) => void }) {
  const [metric, setMetric] = useState<ComparisonMetric>("learners");
  const [mode, setMode] = useState<"all" | "online" | "offline">("all");

  const filteredCentres = mode === "all" ? data.centres : data.centres.filter((c) => c.mode === mode);

  const centreBarData = filteredCentres.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name,
    learners: c.learnerCount,
    active: c.activeLearners,
    completion: c.completionRate,
    quiz: c.avgQuizScore ?? 0,
  }));

  // Student count comparison
  const studentCompare = filteredCentres.sort((a, b) => b.learnerCount - a.learnerCount).map((c) => ({
    name: c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name,
    learners: c.learnerCount,
    active: c.activeLearners,
  }));

  // Quiz score comparison
  const quizCompare = filteredCentres
    .filter((c) => c.avgQuizScore != null)
    .sort((a, b) => (b.avgQuizScore ?? 0) - (a.avgQuizScore ?? 0))
    .map((c) => ({
      name: c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name,
      score: c.avgQuizScore ?? 0,
      attempts: c.quizAttempts,
    }));

  // Online vs Offline split
  const onlineCentres = data.centres.filter((c) => c.mode === "online");
  const offlineCentres = data.centres.filter((c) => c.mode === "offline");
  const hasModeSplit = onlineCentres.length > 0 && offlineCentres.length > 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Completed" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Activity className="h-6 w-6 text-emerald-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Active Learners (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Avg Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      {/* Chart 1: Centre Comparison with metric switcher + mode filter */}
      <ClayCard hover={false} className="!p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-poppins text-lg font-bold text-heading">Centre Comparison</h3>
          <div className="flex gap-3">
            {hasModeSplit && <ModeFilter value={mode} onChange={setMode} />}
            <MetricSwitcher value={metric} onChange={setMetric} />
          </div>
        </div>
        <ComparisonBars items={centreBarData} metric={metric} />
      </ClayCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 2: Student Count Comparison */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Students per Centre</h3>
          {studentCompare.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(studentCompare.length * 40, 120)}>
              <BarChart data={studentCompare} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="learners" fill={CHART_ORANGE} radius={[0, 6, 6, 0]} barSize={12} name="Total" />
                <Bar dataKey="active" fill={CHART_GREEN} radius={[0, 6, 6, 0]} barSize={12} name="Active 7d" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No centres</p>}
        </ClayCard>

        {/* Chart 3: Quiz Score Comparison */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Quiz Score by Centre</h3>
          {quizCompare.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(quizCompare.length * 40, 120)}>
              <BarChart data={quizCompare} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="score" fill={CHART_PURPLE} radius={[0, 6, 6, 0]} barSize={14} name="Avg Score" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No quiz data</p>}
        </ClayCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 4: Mastery Distribution */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Quiz Mastery Distribution</h3>
          <MasteryDonut distribution={data.masteryDistribution} total={data.totalQuizAttempts} />
        </ClayCard>

        {/* Chart 5: Online vs Offline Split */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Online vs Offline</h3>
          {hasModeSplit ? (
            <div className="space-y-3 pt-2">
              {[
                { label: "Online", centres: onlineCentres, color: "bg-green-50 text-green-700" },
                { label: "Offline", centres: offlineCentres, color: "bg-amber-50 text-amber-700" },
              ].map((group) => {
                const learners = group.centres.reduce((s, c) => s + c.learnerCount, 0);
                const avgCompletion = group.centres.length > 0 ? Math.round(group.centres.reduce((s, c) => s + c.completionRate, 0) / group.centres.length) : 0;
                const quizCentres = group.centres.filter((c) => c.avgQuizScore != null);
                const avgQuiz = quizCentres.length > 0 ? Math.round(quizCentres.reduce((s, c) => s + (c.avgQuizScore ?? 0), 0) / quizCentres.length) : null;
                return (
                  <div key={group.label} className={`rounded-clay ${group.color} px-4 py-3`}>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold">{group.centres.length} {group.label} Centres</p>
                      <p className="text-xs">{learners} learners</p>
                    </div>
                    <div className="mt-2 flex gap-6 text-xs">
                      <span>Completion: <strong>{avgCompletion}%</strong></span>
                      <span>Quiz Avg: <strong>{avgQuiz != null ? `${avgQuiz}%` : "—"}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">All centres are {data.centres[0]?.mode ?? "online"}</p>
          )}
        </ClayCard>
      </div>

      {/* Centre Table */}
      <ClayCard hover={false} className="!p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-poppins text-lg font-bold text-heading">Centre Performance</h3>
          {hasModeSplit && <ModeFilter value={mode} onChange={setMode} />}
        </div>
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
              {filteredCentres.map((centre) => (
                <tr key={centre.id} className="cursor-pointer border-b border-orange-primary/5 transition hover:bg-orange-50/40" onClick={() => onSelectCentre(centre)}>
                  <td className="py-3 pr-4"><p className="font-semibold text-heading">{centre.name}</p><p className="text-xs text-muted">{centre.location}</p></td>
                  <td className="py-3 pr-4">{centre.mode === "offline" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><WifiOff className="h-3 w-3" /> Offline</span> : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"><Wifi className="h-3 w-3" /> Online</span>}</td>
                  <td className="py-3 pr-4 text-right font-medium">{centre.learnerCount}</td>
                  <td className="py-3 pr-4 text-right font-medium text-emerald-600">{centre.activeLearners}</td>
                  <td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-orange-primary/10"><div className="h-full rounded-full bg-orange-primary" style={{ width: `${centre.completionRate}%` }} /></div><span className="text-xs font-semibold">{centre.completionRate}%</span></div></td>
                  <td className="py-3 pr-4 text-right text-xs">{centre.completedChapters}/{centre.totalChapters}</td>
                  <td className="py-3 pr-4 text-right text-xs">{centre.avgQuizScore != null ? `${centre.avgQuizScore}%` : "—"}</td>
                  <td className="py-3 text-right text-xs text-muted">{centre.lastActivityAt ? new Date(centre.lastActivityAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ClayCard>
    </>
  );
}

// ═══════════════════════════════════════════
// CENTRE VIEW — 5 charts
// ═══════════════════════════════════════════

function CentreView({ centre, classes, onSelectClass, data }: {
  centre: CentreStats | null;
  classes: import("@/lib/analytics-v2/server").ClassStats[];
  onSelectClass: (c: import("@/lib/analytics-v2/server").ClassStats) => void;
  data: ImpactDashboard;
}) {
  const classCompletionData = classes.map((c) => ({ name: c.label, completion: c.completionRate, quiz: c.avgQuizScore ?? 0 }));
  const classLessonData = classes.map((c) => ({ name: c.label, watched: c.watchedLessons, remaining: c.totalLessons - c.watchedLessons }));

  // Funnel
  const totalCh = data.totalChapters;
  const watchedLessons = classes.reduce((s, c) => s + c.watchedLessons, 0);
  const totalLessons = classes.reduce((s, c) => s + c.totalLessons, 0);
  const startedCh = totalLessons > 0 ? Math.max(data.completedChapters, Math.round(totalCh * (watchedLessons / totalLessons))) : 0;

  return (
    <>
      {centre && (
        <div className="flex items-center gap-3">
          {centre.mode === "offline" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Offline</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"><Wifi className="h-3.5 w-3.5" /> Online</span>
          )}
          {centre.lastSyncAt && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Last sync: {new Date(centre.lastSyncAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Done" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Target className="h-6 w-6 text-blue-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Learners Active (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 1: Class Completion Comparison */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Class-wise Completion</h3>
          {classCompletionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(classCompletionData.length * 36, 120)}>
              <BarChart data={classCompletionData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={60} tick={{ fill: "#2D2117", fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="completion" fill={CHART_BLUE} radius={[0, 6, 6, 0]} barSize={14} name="Completion %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No class data</p>}
        </ClayCard>

        {/* Chart 2: Class Quiz Score Comparison */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Class-wise Quiz Scores</h3>
          {classCompletionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(classCompletionData.length * 36, 120)}>
              <BarChart data={classCompletionData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={60} tick={{ fill: "#2D2117", fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="quiz" fill={CHART_PURPLE} radius={[0, 6, 6, 0]} barSize={14} name="Avg Quiz %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No class data</p>}
        </ClayCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 3: Lesson Progress stacked */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Lesson Progress by Class</h3>
          {classLessonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(classLessonData.length * 36, 120)}>
              <BarChart data={classLessonData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={60} tick={{ fill: "#2D2117", fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="watched" stackId="a" fill={CHART_GREEN} barSize={14} name="Watched" />
                <Bar dataKey="remaining" stackId="a" fill="#E5E7EB" radius={[0, 6, 6, 0]} barSize={14} name="Remaining" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>

        {/* Chart 4: Mastery Donut */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Quiz Mastery</h3>
          {centre ? <MasteryDonut distribution={centre.masteryDistribution} total={centre.quizAttempts} /> : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>
      </div>

      {/* Chart 5: Completion Funnel */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Completion Funnel</h3>
        <div className="flex items-center justify-center gap-4">
          {[
            { label: "Total Chapters", value: totalCh, color: "bg-slate-100 text-slate-700" },
            { label: "Started", value: startedCh, color: "bg-orange-100 text-orange-700" },
            { label: "Completed", value: data.completedChapters, color: "bg-emerald-100 text-emerald-700" },
          ].map((stage, i, arr) => (
            <div key={stage.label} className="flex items-center gap-4">
              <div className={`rounded-clay px-6 py-4 text-center ${stage.color}`} style={{ minWidth: `${120 - i * 15}px` }}>
                <p className="text-2xl font-bold">{stage.value}</p>
                <p className="text-xs">{stage.label}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="text-center text-xs text-muted">
                  <p>→</p>
                  <p>{stage.value > 0 ? Math.round((arr[i + 1].value / stage.value) * 100) : 0}%</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ClayCard>

      {/* Class list */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Class-wise Progress</h3>
        <div className="space-y-3">
          {classes.map((cls) => (
            <div key={cls.classNum} className="flex cursor-pointer items-center gap-4 rounded-clay border border-orange-primary/10 bg-white/80 px-4 py-3 transition hover:border-orange-primary/20 hover:bg-orange-50/40" onClick={() => onSelectClass(cls)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-lg font-bold text-orange-primary">{cls.classNum === 0 ? "K" : cls.classNum}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-heading">{cls.label}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-orange-primary/10"><div className="h-full rounded-full" style={{ width: `${cls.completionRate}%`, background: cls.completionRate === 100 ? CHART_GREEN : CHART_ORANGE }} /></div>
              </div>
              <div className="grid grid-cols-4 gap-6 text-center text-xs">
                <div><p className="font-bold text-heading">{cls.completedChapters}/{cls.totalChapters}</p><p className="text-muted">Chapters</p></div>
                <div><p className="font-bold" style={{ color: cls.completionRate === 100 ? CHART_GREEN : CHART_ORANGE }}>{cls.completionRate}%</p><p className="text-muted">Complete</p></div>
                <div><p className="font-bold text-heading">{cls.watchedLessons}/{cls.totalLessons}</p><p className="text-muted">Lessons</p></div>
                <div><p className="font-bold text-heading">{cls.avgQuizScore != null ? `${cls.avgQuizScore}%` : "—"}</p><p className="text-muted">Quiz Avg</p></div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </div>
          ))}
          {classes.length === 0 && <p className="text-sm text-muted">No class data available.</p>}
        </div>
      </ClayCard>
    </>
  );
}

// ═══════════════════════════════════════════
// CLASS VIEW — 5 charts
// ═══════════════════════════════════════════

function ClassView({ subjects, onSelectSubject, data }: {
  subjects: SubjectStats[];
  onSelectSubject: (s: SubjectStats) => void;
  data: ImpactDashboard;
}) {
  const subjCompletionData = subjects.map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name, completion: s.completionRate, quiz: s.bestQuizScore ?? 0 }));
  const subjLessonData = subjects.map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name, watched: s.watchedLessons, remaining: s.totalLessons - s.watchedLessons }));
  const subjChapterData = subjects.map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name, completed: s.completedChapters, remaining: s.totalChapters - s.completedChapters }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Done" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Activity className="h-6 w-6 text-emerald-600" />} value={`${data.activeLearners}/${data.totalLearners}`} label="Active Learners (7d)" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.avgQuizScore != null ? `${data.avgQuizScore}%` : "—"} label={`Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 1: Subject Completion Comparison */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Subject Completion</h3>
          {subjCompletionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(subjCompletionData.length * 36, 120)}>
              <BarChart data={subjCompletionData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="completion" fill={CHART_BLUE} radius={[0, 6, 6, 0]} barSize={14} name="Completion %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>

        {/* Chart 2: Subject Quiz Scores */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Subject Quiz Scores</h3>
          {subjCompletionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(subjCompletionData.length * 36, 120)}>
              <BarChart data={subjCompletionData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="quiz" fill={CHART_PURPLE} radius={[0, 6, 6, 0]} barSize={14} name="Best Score %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 3: Subject Lesson Progress stacked */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Lesson Progress</h3>
          {subjLessonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(subjLessonData.length * 36, 120)}>
              <BarChart data={subjLessonData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="watched" stackId="a" fill={CHART_GREEN} barSize={14} name="Watched" />
                <Bar dataKey="remaining" stackId="a" fill="#E5E7EB" radius={[0, 6, 6, 0]} barSize={14} name="Remaining" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>

        {/* Chart 4: Chapter Breakdown stacked */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Chapter Breakdown</h3>
          {subjChapterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(subjChapterData.length * 36, 120)}>
              <BarChart data={subjChapterData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#2D2117", fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="completed" stackId="a" fill={CHART_ORANGE} barSize={14} name="Completed" />
                <Bar dataKey="remaining" stackId="a" fill="#E5E7EB" radius={[0, 6, 6, 0]} barSize={14} name="Remaining" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>
      </div>

      {/* Chart 5: Summary overview */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Class Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-clay bg-orange-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-orange-primary">{subjects.length}</p>
            <p className="text-xs text-muted">Subjects</p>
          </div>
          <div className="rounded-clay bg-blue-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{subjects.reduce((s, sub) => s + sub.totalChapters, 0)}</p>
            <p className="text-xs text-muted">Total Chapters</p>
          </div>
          <div className="rounded-clay bg-emerald-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{subjects.reduce((s, sub) => s + sub.watchedLessons, 0)}/{subjects.reduce((s, sub) => s + sub.totalLessons, 0)}</p>
            <p className="text-xs text-muted">Lessons Watched</p>
          </div>
          <div className="rounded-clay bg-purple-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{subjects.reduce((s, sub) => s + sub.quizAttempts, 0)}</p>
            <p className="text-xs text-muted">Quiz Attempts</p>
          </div>
        </div>
      </ClayCard>

      {/* Subject list */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-4 font-poppins text-lg font-bold text-heading">Subject-wise Progress</h3>
        <div className="space-y-3">
          {subjects.map((subject) => (
            <div key={subject.id} className="flex cursor-pointer items-center gap-4 rounded-clay border border-orange-primary/10 bg-white/80 px-4 py-3 transition hover:border-orange-primary/20 hover:bg-orange-50/40" onClick={() => onSelectSubject(subject)}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-heading">{subject.name}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-orange-primary/10"><div className="h-full rounded-full" style={{ width: `${subject.completionRate}%`, background: subject.completionRate === 100 ? CHART_GREEN : CHART_ORANGE }} /></div>
              </div>
              <div className="grid grid-cols-4 gap-6 text-center text-xs">
                <div><p className="font-bold text-heading">{subject.completedChapters}/{subject.totalChapters}</p><p className="text-muted">Chapters</p></div>
                <div><p className="font-bold" style={{ color: subject.completionRate === 100 ? CHART_GREEN : CHART_ORANGE }}>{subject.completionRate}%</p><p className="text-muted">Complete</p></div>
                <div><p className="font-bold text-heading">{subject.quizAttempts}</p><p className="text-muted">Attempts</p></div>
                <div><p className="font-bold" style={{ color: (subject.bestQuizScore ?? 0) >= 80 ? CHART_GREEN : (subject.bestQuizScore ?? 0) >= 50 ? CHART_ORANGE : CHART_RED }}>{subject.bestQuizScore != null ? `${subject.bestQuizScore}%` : "—"}</p><p className="text-muted">Best</p></div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </div>
          ))}
        </div>
      </ClayCard>
    </>
  );
}

// ═══════════════════════════════════════════
// SUBJECT VIEW — 3 charts
// ═══════════════════════════════════════════

function SubjectView({ chapters, data }: { chapters: ChapterStats[]; data: ImpactDashboard }) {
  const chapterLessonData = chapters.map((c) => ({
    name: c.title.length > 16 ? `Ch ${c.chapterNo}` : c.title,
    completed: c.completedLessons,
    remaining: c.totalLessons - c.completedLessons,
  }));
  const chapterQuizData = chapters.filter((c) => c.bestQuizScore != null).map((c) => ({
    name: c.title.length > 16 ? `Ch ${c.chapterNo}` : c.title,
    score: c.bestQuizScore ?? 0,
  }));
  const completedCount = chapters.filter((c) => c.isComplete).length;
  const inProgressCount = chapters.filter((c) => !c.isComplete && c.completedLessons > 0).length;
  const notStartedCount = chapters.filter((c) => c.completedLessons === 0).length;
  const statusPie = [
    { name: "Completed", value: completedCount, color: CHART_GREEN },
    { name: "In Progress", value: inProgressCount, color: CHART_ORANGE },
    { name: "Not Started", value: notStartedCount, color: CHART_SLATE },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard icon={<BookOpenCheck className="h-6 w-6 text-orange-primary" />} value={`${data.completedChapters}/${data.totalChapters}`} label="Chapters Done" />
        <MetricCard icon={<ProgressRing percentage={data.completionRate} size={48} strokeWidth={5}><span className="text-xs font-bold">{data.completionRate}%</span></ProgressRing>} value="" label="Completion Rate" />
        <MetricCard icon={<Target className="h-6 w-6 text-blue-600" />} value={`${chapters.reduce((s, c) => s + c.completedLessons, 0)}/${chapters.reduce((s, c) => s + c.totalLessons, 0)}`} label="Lessons Watched" />
        <MetricCard icon={<Award className="h-6 w-6 text-purple-600" />} value={data.bestQuizScore != null ? `${data.bestQuizScore}%` : "—"} label={`Best Quiz Score (${data.totalQuizAttempts} attempts)`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Chart 1: Chapter Lesson Completion */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Chapter Lesson Progress</h3>
          {chapterLessonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(chapterLessonData.length * 28, 120)}>
              <BarChart data={chapterLessonData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#2D2117", fontSize: 9 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="completed" stackId="a" fill={CHART_GREEN} barSize={12} name="Done" />
                <Bar dataKey="remaining" stackId="a" fill="#E5E7EB" radius={[0, 4, 4, 0]} barSize={12} name="Remaining" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No data</p>}
        </ClayCard>

        {/* Chart 2: Chapter Quiz Scores */}
        <ClayCard hover={false} className="!p-6">
          <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Chapter Quiz Scores</h3>
          {chapterQuizData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(chapterQuizData.length * 28, 120)}>
              <BarChart data={chapterQuizData} layout="vertical" margin={{ left: 5, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7c6a58", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#2D2117", fontSize: 9 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                <Bar dataKey="score" fill={CHART_PURPLE} radius={[0, 6, 6, 0]} barSize={12} name="Best Score" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-sm text-muted">No quiz data</p>}
        </ClayCard>
      </div>

      {/* Chart 3: Completion status pie */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="mb-2 font-poppins text-lg font-bold text-heading">Completion Overview</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusPie} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} style={{ fontSize: 11 }}>
                {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col justify-center gap-3">
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-emerald-500" /><span className="text-sm"><strong>{completedCount}</strong> Completed</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-orange-500" /><span className="text-sm"><strong>{inProgressCount}</strong> In Progress</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-slate-400" /><span className="text-sm"><strong>{notStartedCount}</strong> Not Started</span></div>
          </div>
        </div>
      </ClayCard>

      {/* Chapter detail list */}
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
                  <p className="text-xs text-muted">{chapter.completedLessons}/{chapter.totalLessons} lessons{chapter.quizAttempts > 0 && ` · ${chapter.quizAttempts} quiz attempt${chapter.quizAttempts > 1 ? "s" : ""}`}{chapter.bestQuizScore != null && ` · Best: ${chapter.bestQuizScore}%`}</p>
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
                        {lesson.completed ? <span className="text-emerald-600 font-semibold">Done</span> : lesson.watchedPercentage > 0 ? <span className="text-orange-primary font-semibold">{lesson.watchedPercentage}%</span> : <span className="text-slate-400">—</span>}
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
