import { MissAshaChat } from "@/components/asha/miss-asha-chat";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";

export const metadata = { title: "AI Tutor" };

export default function AiTutorPage() {
  return (
    <div className="h-[calc(100dvh-7rem)] min-h-[560px] lg:h-[calc(100dvh-6rem)]">
      <ScrollResetOnMount />
      <MissAshaChat mode="page" />
    </div>
  );
}
