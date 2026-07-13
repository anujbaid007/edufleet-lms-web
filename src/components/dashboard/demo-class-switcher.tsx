"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDemoClass } from "@/lib/actions/demo";
import { GraduationCap } from "lucide-react";

function classLabel(c: number) {
  return c === 0 ? "KG" : `Class ${c}`;
}

export function DemoClassSwitcher({
  currentClass,
  options,
}: {
  currentClass: number | null;
  options: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-1 mb-2 rounded-clay-sm bg-cream/70 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-orange-primary">
        <GraduationCap className="h-3.5 w-3.5" /> Demo · Viewing {currentClass === null ? "—" : classLabel(currentClass)}
      </div>
      <select
        aria-label="Switch class"
        className="clay-input w-full !py-2 text-sm"
        value={currentClass ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          startTransition(async () => {
            const res = await setDemoClass(next);
            if (res.success) router.refresh();
          });
        }}
      >
        {options.map((c) => (
          <option key={c} value={c}>{classLabel(c)}</option>
        ))}
      </select>
    </div>
  );
}
