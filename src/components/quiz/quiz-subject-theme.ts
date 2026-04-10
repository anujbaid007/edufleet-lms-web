export type QuizSubjectTheme = {
  color: string;
  badgeClassName: string;
  softBadgeClassName: string;
  sectionGradientClassName: string;
};

const subjectThemes: Record<string, QuizSubjectTheme> = {
  English: {
    color: "#8B5CF6",
    badgeClassName: "bg-violet-50 text-violet-700",
    softBadgeClassName: "bg-violet-100/80 text-violet-700",
    sectionGradientClassName: "from-violet-50 via-white to-white",
  },
  Mathematics: {
    color: "#3B82F6",
    badgeClassName: "bg-sky-50 text-sky-700",
    softBadgeClassName: "bg-sky-100/80 text-sky-700",
    sectionGradientClassName: "from-sky-50 via-white to-white",
  },
  Science: {
    color: "#10B981",
    badgeClassName: "bg-emerald-50 text-emerald-700",
    softBadgeClassName: "bg-emerald-100/80 text-emerald-700",
    sectionGradientClassName: "from-emerald-50 via-white to-white",
  },
  EVS: {
    color: "#16A34A",
    badgeClassName: "bg-green-50 text-green-700",
    softBadgeClassName: "bg-green-100/80 text-green-700",
    sectionGradientClassName: "from-green-50 via-white to-white",
  },
  Economics: {
    color: "#F97316",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
  History: {
    color: "#F59E0B",
    badgeClassName: "bg-amber-50 text-amber-700",
    softBadgeClassName: "bg-amber-100/80 text-amber-700",
    sectionGradientClassName: "from-amber-50 via-white to-white",
  },
  Geography: {
    color: "#0EA5E9",
    badgeClassName: "bg-cyan-50 text-cyan-700",
    softBadgeClassName: "bg-cyan-100/80 text-cyan-700",
    sectionGradientClassName: "from-cyan-50 via-white to-white",
  },
  Civics: {
    color: "#EC4899",
    badgeClassName: "bg-pink-50 text-pink-700",
    softBadgeClassName: "bg-pink-100/80 text-pink-700",
    sectionGradientClassName: "from-pink-50 via-white to-white",
  },
  "Political Science": {
    color: "#EF4444",
    badgeClassName: "bg-rose-50 text-rose-700",
    softBadgeClassName: "bg-rose-100/80 text-rose-700",
    sectionGradientClassName: "from-rose-50 via-white to-white",
  },
  Accountancy: {
    color: "#8B5CF6",
    badgeClassName: "bg-violet-50 text-violet-700",
    softBadgeClassName: "bg-violet-100/80 text-violet-700",
    sectionGradientClassName: "from-violet-50 via-white to-white",
  },
  "Business Studies": {
    color: "#F97316",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
  Physics: {
    color: "#6366F1",
    badgeClassName: "bg-indigo-50 text-indigo-700",
    softBadgeClassName: "bg-indigo-100/80 text-indigo-700",
    sectionGradientClassName: "from-indigo-50 via-white to-white",
  },
  Chemistry: {
    color: "#14B8A6",
    badgeClassName: "bg-teal-50 text-teal-700",
    softBadgeClassName: "bg-teal-100/80 text-teal-700",
    sectionGradientClassName: "from-teal-50 via-white to-white",
  },
  Biology: {
    color: "#22C55E",
    badgeClassName: "bg-lime-50 text-lime-700",
    softBadgeClassName: "bg-lime-100/80 text-lime-700",
    sectionGradientClassName: "from-lime-50 via-white to-white",
  },
  Computer: {
    color: "#8B5CF6",
    badgeClassName: "bg-fuchsia-50 text-fuchsia-700",
    softBadgeClassName: "bg-fuchsia-100/80 text-fuchsia-700",
    sectionGradientClassName: "from-fuchsia-50 via-white to-white",
  },
  default: {
    color: "#E8871E",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
};

export function getSubjectTheme(subjectName: string) {
  return subjectThemes[subjectName] ?? subjectThemes.default;
}
