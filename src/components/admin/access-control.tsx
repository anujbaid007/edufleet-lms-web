"use client";

import { useState, useTransition } from "react";
import { ClayCard } from "@/components/ui/clay-card";
import { addRestriction, removeRestriction } from "@/lib/actions/admin";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface SubjectGroup {
  key: string;
  className: number;
  medium: string;
  subjectId: string;
  subjectName: string;
  chapterIds: string[];
}

interface ClassGroup {
  class: number;
  groups: SubjectGroup[];
}

interface Restriction {
  id: string;
  org_id: string;
  chapter_id: string;
}

interface Props {
  organizations: { id: string; name: string }[];
  byClass: ClassGroup[];
  restrictions: Restriction[];
  defaultOrgId: string;
}

export function AccessControl({ organizations, byClass, restrictions, defaultOrgId }: Props) {
  const [selectedOrg, setSelectedOrg] = useState(defaultOrgId);
  const [selectedMedium, setSelectedMedium] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const router = useRouter();

  // Derive available mediums
  const allMediums = Array.from(new Set(byClass.flatMap((cls) => cls.groups.map((g) => g.medium)))).sort();

  // Filter by medium
  const filteredByClass = byClass.map((cls) => ({
    ...cls,
    groups: cls.groups.filter((g) => selectedMedium === "all" || g.medium === selectedMedium),
  })).filter((cls) => cls.groups.length > 0);

  // For the selected org, figure out which subject groups are blocked
  const orgRestrictions = restrictions.filter((r) => r.org_id === selectedOrg);
  const blockedChapterIds = new Set(orgRestrictions.map((r) => r.chapter_id));

  function isGroupBlocked(group: SubjectGroup) {
    // A group is "blocked" if ALL its chapters are restricted
    return group.chapterIds.length > 0 && group.chapterIds.every((id) => blockedChapterIds.has(id));
  }

  function isGroupPartial(group: SubjectGroup) {
    const blocked = group.chapterIds.filter((id) => blockedChapterIds.has(id)).length;
    return blocked > 0 && blocked < group.chapterIds.length;
  }

  async function toggleGroup(group: SubjectGroup) {
    setLoadingKey(group.key);
    const blocked = isGroupBlocked(group);

    startTransition(async () => {
      if (blocked) {
        // Unblock: remove all restrictions for this group's chapters
        const toRemove = orgRestrictions.filter((r) => group.chapterIds.includes(r.chapter_id));
        for (const r of toRemove) {
          await removeRestriction(r.id);
        }
      } else {
        // Block: add restrictions for all unrestricted chapters in this group
        const unrestricted = group.chapterIds.filter((id) => !blockedChapterIds.has(id));
        for (const chId of unrestricted) {
          await addRestriction(selectedOrg, chId);
        }
      }
      router.refresh();
      setLoadingKey(null);
    });
  }

  const blockedCount = filteredByClass.reduce(
    (sum, cls) => sum + cls.groups.filter((g) => isGroupBlocked(g)).length,
    0
  );
  const totalCount = filteredByClass.reduce((sum, cls) => sum + cls.groups.length, 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-heading">Organization:</label>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-4 py-2 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary clay-input"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-heading">Medium:</label>
          <select
            value={selectedMedium}
            onChange={(e) => setSelectedMedium(e.target.value)}
            className="px-4 py-2 text-sm border border-orange-primary/30 rounded-lg focus:outline-none focus:border-orange-primary clay-input"
          >
            <option value="all">All Mediums</option>
            {allMediums.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted ml-auto">
          {totalCount - blockedCount} of {totalCount} subjects accessible
        </span>
      </div>

      {/* Class-wise subject toggles */}
      {filteredByClass.map((cls) => (
        <ClayCard key={cls.class} hover={false} className="!p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg clay-surface-orange flex items-center justify-center shadow-clay-orange">
              <span className="text-xs font-bold text-white">
                {cls.class === 0 ? "KG" : cls.class}
              </span>
            </div>
            <h3 className="text-sm font-bold text-heading">
              {cls.class === 0 ? "Kindergarten" : `Class ${cls.class}`}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {cls.groups.map((group) => {
              const blocked = isGroupBlocked(group);
              const partial = isGroupPartial(group);
              const isLoading = loadingKey === group.key;

              return (
                <button
                  key={group.key}
                  onClick={() => toggleGroup(group)}
                  disabled={isPending}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                    blocked
                      ? "border-red-200 bg-red-50/60 text-red-700"
                      : partial
                      ? "border-yellow-200 bg-yellow-50/60 text-yellow-700"
                      : "border-green-200 bg-green-50/60 text-green-700"
                  } hover:shadow-sm`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <div className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center ${
                      blocked ? "border-red-400 bg-red-400" : partial ? "border-yellow-400 bg-yellow-400" : "border-green-400 bg-green-400"
                    }`}>
                      {!blocked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{group.subjectName}</p>
                    <p className="text-[10px] opacity-70">
                      {group.medium} · {group.chapterIds.length} ch
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </ClayCard>
      ))}
    </div>
  );
}
