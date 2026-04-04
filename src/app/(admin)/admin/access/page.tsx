import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { BookOpen } from "lucide-react";

export const metadata = { title: "Content Access" };

export default async function AccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get all chapters to derive mediums and subjects per class
  const { data: chapters } = await supabase
    .from("chapters")
    .select("class, medium, subject_id, subjects(name)")
    .order("class")
    .order("medium");

  // Get distinct mediums
  const mediums = Array.from(new Set((chapters ?? []).map((c) => c.medium).filter(Boolean))) as string[];

  // Group subjects by class and medium
  const classGroups = new Map<number, Map<string, Set<string>>>();
  for (const ch of chapters ?? []) {
    const cls = ch.class;
    const med = ch.medium ?? "Unknown";
    const subName = (ch.subjects as unknown as { name: string } | null)?.name ?? "Unknown";
    if (!classGroups.has(cls)) classGroups.set(cls, new Map());
    const medMap = classGroups.get(cls)!;
    if (!medMap.has(med)) medMap.set(med, new Set());
    medMap.get(med)!.add(subName);
  }

  const sortedClasses = Array.from(classGroups.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <Header
        title="Content Library"
        subtitle={`${mediums.length} mediums · ${sortedClasses.length} classes`}
      />

      {/* Mediums */}
      <div className="flex gap-3 flex-wrap">
        {mediums.map((m) => (
          <div key={m} className="clay-pill !px-4 !py-2 font-semibold">
            {m} Medium
          </div>
        ))}
      </div>

      {/* Classes with subjects */}
      <div className="space-y-3">
        {sortedClasses.map((cls) => {
          const medMap = classGroups.get(cls)!;
          return (
            <ClayCard key={cls} hover={false} className="!p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-clay-sm clay-surface-orange flex items-center justify-center shadow-clay-orange shrink-0">
                  <span className="text-sm font-bold text-white">{cls === 0 ? "KG" : cls}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-heading mb-2">
                    {cls === 0 ? "Kindergarten" : `Class ${cls}`}
                  </p>
                  <div className="space-y-1.5">
                    {Array.from(medMap.entries()).map(([med, subjects]) => (
                      <div key={med} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-orange-primary bg-orange-50 px-2 py-0.5 rounded-full">
                          {med}
                        </span>
                        {Array.from(subjects).sort().map((sub) => (
                          <span key={sub} className="flex items-center gap-1 text-xs text-body">
                            <BookOpen className="w-3 h-3 text-muted" />
                            {sub}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ClayCard>
          );
        })}
      </div>
    </div>
  );
}
