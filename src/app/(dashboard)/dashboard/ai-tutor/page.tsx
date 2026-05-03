import Image from "next/image";
import { Bot, Sparkles } from "lucide-react";
import { MissAshaChat } from "@/components/asha/miss-asha-chat";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";

export const metadata = { title: "AI Tutor" };

export default function AiTutorPage() {
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[560px] flex-col gap-5 lg:h-[calc(100dvh-7rem)]">
      <ScrollResetOnMount />

      <section className="shrink-0 overflow-hidden rounded-[28px] border border-white/75 bg-[#FFF5E8] shadow-[0_24px_70px_rgba(122,75,25,0.14)]">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_16px_34px_rgba(232,135,30,0.24)]">
              <Image
                alt=""
                className="h-full w-full object-cover"
                height={64}
                priority
                src="/miss-asha-avatar.webp"
                width={64}
              />
              <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-orange-primary" />
            </div>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI Tutor
              </p>
              <h1 className="mt-2 font-poppins text-2xl font-bold leading-tight text-heading sm:text-3xl">
                Miss Asha
              </h1>
              <p className="mt-1 text-sm font-semibold text-muted">
                Ask doubts, revise chapters, and practise questions in one focused study chat.
              </p>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-orange-primary/15 bg-white/75 px-3 py-2 text-xs font-bold text-heading">
            <Bot className="h-4 w-4 text-orange-primary" />
            EduFleet learning companion
          </div>
        </div>
      </section>

      <div className="min-h-0 flex-1">
        <MissAshaChat mode="page" />
      </div>
    </div>
  );
}
