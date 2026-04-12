"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Flame, Sparkles, Sun, Sunrise, Moon, BookOpenCheck } from "lucide-react";
import { useLanguage } from "@/context/language-context";

interface WelcomeHeroProps {
  name: string;
  streak: number;
  completedChapters: number;
  totalChapters: number;
}

function getGreetingKey(hour: number): { key: string; icon: React.ComponentType<{ className?: string }> } {
  if (hour < 5) return { key: "greeting.midnight", icon: Moon };
  if (hour < 12) return { key: "greeting.morning", icon: Sunrise };
  if (hour < 17) return { key: "greeting.afternoon", icon: Sun };
  if (hour < 21) return { key: "greeting.evening", icon: Sun };
  return { key: "greeting.night", icon: Moon };
}

function pickMessageKey(streak: number, completed: number, total: number): string {
  if (total === 0) return "msg.noChapters";
  if (completed === 0) return "msg.noProgress";
  if (streak >= 7) return "msg.fireStreak";
  if (streak >= 3) return "msg.goodStreak";
  if (completed >= Math.floor(total * 0.75)) return "msg.nearlyDone";
  if (completed >= Math.floor(total / 2)) return "msg.halfway";
  return "msg.keepGoing";
}

function firstWord(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "learner";
  return trimmed.split(/\s+/)[0];
}

export function WelcomeHero({
  name,
  streak,
  completedChapters,
  totalChapters,
}: WelcomeHeroProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();

  const { greetingLabel, GreetingIcon, message, displayName, progressPercent } = useMemo(() => {
    const hour = new Date().getHours();
    const { key: greetingKey, icon } = getGreetingKey(hour);
    const msgKey = pickMessageKey(streak, completedChapters, totalChapters);
    return {
      greetingLabel: t(greetingKey),
      GreetingIcon: icon,
      message: t(msgKey, { n: streak }),
      displayName: firstWord(name),
      progressPercent:
        totalChapters > 0
          ? Math.round((completedChapters / totalChapters) * 100)
          : 0,
    };
  }, [name, streak, completedChapters, totalChapters, t]);

  const container = reduceMotion
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.08, delayChildren: 0.05 },
        },
      };

  const item = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring" as const, stiffness: 260, damping: 26 },
        },
      };

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={container}
      className="relative overflow-hidden rounded-[32px] border-2 border-white/80 p-6 sm:p-8 lg:p-10"
      style={{
        background:
          "linear-gradient(145deg, #FFFFFF 0%, #FFF5EB 45%, #FFE4C7 100%)",
        boxShadow:
          "12px 12px 36px rgba(200,160,120,0.22), -10px -10px 28px rgba(255,255,255,0.95), inset 3px 3px 8px rgba(255,255,255,0.9), inset -3px -3px 10px rgba(200,160,120,0.14)",
      }}
    >
      {/* Decorative clay blobs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full sm:-right-10 sm:-top-16 sm:h-64 sm:w-64"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(249,115,22,0.35), rgba(232,135,30,0.08) 55%, transparent 75%)",
          filter: "blur(2px)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { y: [0, -10, 0], rotate: [0, 6, 0] }
        }
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(254,215,170,0.65), rgba(255,255,255,0) 70%)",
          filter: "blur(2px)",
        }}
        animate={reduceMotion ? undefined : { y: [0, 8, 0], x: [0, 6, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-10 top-8 hidden h-2 w-2 rounded-full bg-orange-primary/70 sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-24 top-16 hidden h-1.5 w-1.5 rounded-full bg-orange-primary/40 sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-4 bottom-10 hidden h-1.5 w-1.5 rounded-full bg-orange-primary/50 lg:block"
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <motion.div
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary shadow-[4px_4px_12px_rgba(200,160,120,0.12),-3px_-3px_8px_rgba(255,255,255,0.9)] backdrop-blur-sm"
          >
            <GreetingIcon className="h-3.5 w-3.5" />
            <span>{greetingLabel}</span>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-4 font-poppins text-[28px] font-bold leading-tight text-heading sm:text-4xl lg:text-[44px]"
          >
            Hey{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #F97316 0%, #E8871E 45%, #C2410C 100%)",
              }}
            >
              {displayName}
            </span>
            <span className="text-orange-primary">.</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-2 max-w-xl text-sm leading-6 text-body sm:text-base"
          >
            {message}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-5 flex flex-wrap items-center gap-2.5"
          >
            <HeroPill
              icon={<Flame className="h-3.5 w-3.5" />}
              label={streak > 0 ? t("hero.streak", { n: streak }) : t("hero.startStreak")}
              tone={streak > 0 ? "hot" : "muted"}
            />
            <HeroPill
              icon={<BookOpenCheck className="h-3.5 w-3.5" />}
              label={
                totalChapters > 0
                  ? t("hero.chapters", { done: completedChapters, total: totalChapters })
                  : t("hero.noChapters")
              }
              tone="muted"
            />
            {totalChapters > 0 && (
              <HeroPill
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label={t("hero.complete", { pct: progressPercent })}
                tone="muted"
              />
            )}
          </motion.div>
        </div>

        {totalChapters > 0 && (
          <motion.div variants={item} className="shrink-0 lg:max-w-[260px]">
            <div className="rounded-[22px] border border-white/70 bg-white/60 p-4 backdrop-blur-sm shadow-[6px_6px_18px_rgba(200,160,120,0.16),-4px_-4px_12px_rgba(255,255,255,0.9)]">
              <div className="flex items-center justify-between text-xs font-semibold text-body">
                <span>{t("hero.courseProgress")}</span>
                <span className="text-orange-primary">{progressPercent}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-orange-primary/10">
                <motion.div
                  initial={reduceMotion ? { width: `${progressPercent}%` } : { width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={
                    reduceMotion
                      ? undefined
                      : { duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }
                  }
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #F97316 0%, #E8871E 50%, #EA580C 100%)",
                    boxShadow: "0 2px 8px rgba(232,135,30,0.35)",
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {totalChapters - completedChapters > 0
                  ? t("hero.chaptersToGo", { n: totalChapters - completedChapters })
                  : t("hero.allDone")}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}

function HeroPill({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "hot" | "muted";
}) {
  if (tone === "hot") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
        style={{
          background: "linear-gradient(145deg, #F97316 0%, #E8871E 50%, #EA580C 100%)",
          boxShadow:
            "4px 4px 12px rgba(232,135,30,0.35), -2px -2px 8px rgba(255,200,140,0.25), inset 1px 1px 3px rgba(255,255,255,0.35)",
        }}
      >
        {icon}
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-body backdrop-blur-sm"
      style={{
        boxShadow:
          "3px 3px 10px rgba(200,160,120,0.14), -2px -2px 8px rgba(255,255,255,0.9)",
      }}
    >
      <span className="text-orange-primary">{icon}</span>
      {label}
    </span>
  );
}
