"use client";

import { useState } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { ChevronRight, BookOpen, Play, GraduationCap, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

type ChapterItem = {
  id: string;
  chapterNo: number;
  title: string;
  videoCount: number;
};

type SubjectGroup = {
  subjectName: string;
  chapters: ChapterItem[];
  totalVideos: number;
};

type MediumGroup = {
  medium: string;
  subjects: SubjectGroup[];
  totalChapters: number;
  totalVideos: number;
};

type ClassGroup = {
  classNum: number;
  mediums: MediumGroup[];
  totalChapters: number;
  totalVideos: number;
};

function classLabel(n: number) {
  if (n === 0) return "Kindergarten";
  if (n === 99) return "General";
  return `Class ${n}`;
}

function classBadge(n: number) {
  if (n === 0) return "KG";
  if (n === 99) return "G";
  return String(n);
}

export function ContentLibraryTree({ tree }: { tree: ClassGroup[] }) {
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [mediumFilter, setMediumFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const toggleClass = (n: number) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const toggleSubject = (key: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedClasses(new Set(tree.map((c) => c.classNum)));
    const allSubs: string[] = [];
    tree.forEach((c) =>
      c.mediums.forEach((m) =>
        m.subjects.forEach((s) => allSubs.push(`${c.classNum}-${m.medium}-${s.subjectName}`))
      )
    );
    setExpandedSubjects(new Set(allSubs));
  };

  const collapseAll = () => {
    setExpandedClasses(new Set());
    setExpandedSubjects(new Set());
  };

  const searchLower = search.toLowerCase();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search chapters or subjects..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value) expandAll();
          }}
          className="clay-input px-4 py-2 text-sm w-64"
        />
        <select
          value={mediumFilter}
          onChange={(e) => setMediumFilter(e.target.value)}
          className="clay-input px-4 py-2 text-sm"
        >
          <option value="all">All Mediums</option>
          <option value="English">English</option>
          <option value="Hindi">Hindi</option>
        </select>
        <div className="flex gap-1 ml-auto">
          <button onClick={expandAll} className="text-xs text-orange-primary hover:underline">
            Expand All
          </button>
          <span className="text-xs text-muted">·</span>
          <button onClick={collapseAll} className="text-xs text-orange-primary hover:underline">
            Collapse All
          </button>
        </div>
      </div>

      {/* Tree */}
      {tree.map((cls) => {
        const filteredMediums = cls.mediums
          .filter((m) => mediumFilter === "all" || m.medium === mediumFilter)
          .map((m) => ({
            ...m,
            subjects: m.subjects
              .map((s) => ({
                ...s,
                chapters: searchLower
                  ? s.chapters.filter(
                      (ch) =>
                        ch.title.toLowerCase().includes(searchLower) ||
                        s.subjectName.toLowerCase().includes(searchLower)
                    )
                  : s.chapters,
              }))
              .filter((s) => s.chapters.length > 0),
          }))
          .filter((m) => m.subjects.length > 0);

        if (filteredMediums.length === 0) return null;

        const isClassExpanded = expandedClasses.has(cls.classNum);
        const filteredChapterCount = filteredMediums.reduce(
          (s, m) => s + m.subjects.reduce((s2, sub) => s2 + sub.chapters.length, 0),
          0
        );
        const filteredVideoCount = filteredMediums.reduce(
          (s, m) =>
            s + m.subjects.reduce((s2, sub) => s2 + sub.chapters.reduce((s3, ch) => s3 + ch.videoCount, 0), 0),
          0
        );

        return (
          <ClayCard key={cls.classNum} hover={false} className="!p-0 overflow-hidden">
            {/* Class header */}
            <button
              onClick={() => toggleClass(cls.classNum)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cream/50 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "w-4 h-4 text-muted transition-transform shrink-0",
                  isClassExpanded && "rotate-90"
                )}
              />
              <div className="w-9 h-9 rounded-lg clay-surface-orange flex items-center justify-center shadow-clay-orange shrink-0">
                <span className="text-xs font-bold text-white">{classBadge(cls.classNum)}</span>
              </div>
              <span className="text-sm font-bold text-heading">{classLabel(cls.classNum)}</span>
              <div className="flex items-center gap-4 ml-auto text-xs text-muted">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  {filteredChapterCount} ch
                </span>
                <span className="flex items-center gap-1">
                  <Play className="w-3.5 h-3.5" />
                  {filteredVideoCount} videos
                </span>
              </div>
            </button>

            {/* Expanded: mediums → subjects → chapters */}
            {isClassExpanded && (
              <div className="border-t border-orange-primary/10">
                {filteredMediums.map((medium) => (
                  <div key={medium.medium}>
                    {/* Medium label */}
                    <div className="flex items-center gap-2 px-12 py-2 bg-cream/30 border-b border-orange-primary/5">
                      <Languages className="w-3.5 h-3.5 text-orange-primary" />
                      <span className="text-xs font-semibold text-heading">{medium.medium}</span>
                      <span className="text-[10px] text-muted">
                        {medium.subjects.reduce((s, sub) => s + sub.chapters.length, 0)} chapters
                      </span>
                    </div>

                    {/* Subjects */}
                    {medium.subjects.map((subject) => {
                      const subKey = `${cls.classNum}-${medium.medium}-${subject.subjectName}`;
                      const isSubExpanded = expandedSubjects.has(subKey);

                      return (
                        <div key={subKey}>
                          <button
                            onClick={() => toggleSubject(subKey)}
                            className="w-full flex items-center gap-2 pl-14 pr-5 py-2.5 hover:bg-cream/40 transition-colors"
                          >
                            <ChevronRight
                              className={cn(
                                "w-3.5 h-3.5 text-muted transition-transform shrink-0",
                                isSubExpanded && "rotate-90"
                              )}
                            />
                            <GraduationCap className="w-4 h-4 text-orange-primary shrink-0" />
                            <span className="text-sm font-medium text-heading">{subject.subjectName}</span>
                            <span className="text-[10px] text-muted ml-1">
                              {subject.chapters.length} ch · {subject.chapters.reduce((s, c) => s + c.videoCount, 0)} videos
                            </span>
                          </button>

                          {/* Chapters */}
                          {isSubExpanded && (
                            <div className="pb-1">
                              {subject.chapters.map((ch) => (
                                <div
                                  key={ch.id}
                                  className="flex items-center gap-2 pl-[5.5rem] pr-5 py-1.5 text-xs"
                                >
                                  <span className="w-6 text-right text-muted font-mono shrink-0">
                                    {ch.chapterNo}.
                                  </span>
                                  <span className="text-body truncate">{ch.title}</span>
                                  <span className="text-[10px] text-muted ml-auto whitespace-nowrap">
                                    {ch.videoCount} {ch.videoCount === 1 ? "video" : "videos"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </ClayCard>
        );
      })}
    </div>
  );
}
