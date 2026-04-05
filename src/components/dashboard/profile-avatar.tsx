"use client";

import { cn } from "@/lib/utils";
import { PROFILE_AVATAR_IDS } from "@/lib/profile-avatars";

const BACKGROUNDS = ["#FFE6CC", "#DDF4FF", "#E7E1FF", "#DDF7E7", "#FFE0E8", "#FFF0C7"];
const SKIN = ["#F5C7A9", "#E9B18D", "#D99674", "#B87358", "#8A5A44"];
const HAIR = ["#2C1E1A", "#5B392C", "#7C523B", "#1D2B53", "#3C2A74"];
const SHIRTS = ["#E8871E", "#5B8DEF", "#9C6ADE", "#2A9D8F", "#F28482", "#F4A261"];
const STYLES = [
  { hair: "short", accessory: "none" },
  { hair: "curl", accessory: "glasses" },
  { hair: "bangs", accessory: "none" },
  { hair: "wave", accessory: "star" },
  { hair: "cap", accessory: "none" },
] as const;

function avatarIndexFromId(avatarId: string) {
  const match = /avatar-(\d+)/.exec(avatarId);
  const parsed = match ? Number(match[1]) : 1;
  const normalized = Number.isFinite(parsed) ? parsed - 1 : 0;
  return Math.min(Math.max(normalized, 0), PROFILE_AVATAR_IDS.length - 1);
}

function Hair({ color, style }: { color: string; style: (typeof STYLES)[number]["hair"] }) {
  if (style === "cap") {
    return (
      <>
        <path d="M38 45c5-12 18-20 34-20s29 8 34 20v12H38V45Z" fill="#F59E0B" />
        <path d="M46 50c10-7 22-10 34-10s24 3 34 10" fill="none" stroke="#D97706" strokeWidth="6" strokeLinecap="round" />
      </>
    );
  }

  if (style === "curl") {
    return (
      <path
        d="M36 61c0-21 15-37 36-37 18 0 33 12 36 31-5-3-10-4-16-4-5 0-10 2-15 5-3-7-9-11-16-11-8 0-14 4-18 11-3-2-5-3-7-3Z"
        fill={color}
      />
    );
  }

  if (style === "bangs") {
    return (
      <path
        d="M38 56c3-18 18-32 38-32 21 0 35 13 38 33-8-6-17-9-27-9-8 0-16 2-24 6-8 5-16 6-25 2Z"
        fill={color}
      />
    );
  }

  if (style === "wave") {
    return (
      <path
        d="M33 60c5-23 20-36 41-36 20 0 34 11 39 31-10-4-18-4-26 0-8 4-15 5-22 1-7-4-14-3-21 4Z"
        fill={color}
      />
    );
  }

  return <path d="M36 59c2-21 18-35 39-35 20 0 35 12 39 34-7-5-16-7-26-7H61c-8 0-16 3-25 8Z" fill={color} />;
}

function Accessory({ tone, type }: { tone: string; type: (typeof STYLES)[number]["accessory"] }) {
  if (type === "glasses") {
    return (
      <>
        <circle cx="60" cy="82" r="8.5" fill="none" stroke={tone} strokeWidth="3" />
        <circle cx="88" cy="82" r="8.5" fill="none" stroke={tone} strokeWidth="3" />
        <path d="M68 82h12" stroke={tone} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  if (type === "star") {
    return (
      <path
        d="m97 50 2.8 5.8 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2-4.5-4.4 6.2-.9L97 50Z"
        fill={tone}
      />
    );
  }

  return null;
}

export function ProfileAvatar({
  avatarId,
  size = 72,
  className,
}: {
  avatarId: string;
  size?: number;
  className?: string;
}) {
  const index = avatarIndexFromId(avatarId);
  const style = STYLES[index % STYLES.length];
  const background = BACKGROUNDS[index % BACKGROUNDS.length];
  const skin = SKIN[index % SKIN.length];
  const hair = HAIR[index % HAIR.length];
  const shirt = SHIRTS[index % SHIRTS.length];

  return (
    <div
      className={cn("overflow-hidden rounded-[28px] shadow-[0_14px_28px_rgba(214,153,68,0.12)]", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 128 128" className="h-full w-full">
        <rect width="128" height="128" rx="32" fill={background} />
        <circle cx="64" cy="74" r="24" fill={skin} />
        <Hair color={hair} style={style.hair} />
        <Accessory tone={hair} type={style.accessory} />
        <ellipse cx="56" cy="82" rx="2.6" ry="3.2" fill="#2B2B2B" />
        <ellipse cx="82" cy="82" rx="2.6" ry="3.2" fill="#2B2B2B" />
        <path d="M60 95c4 4 10 4 14 0" fill="none" stroke="#9A4B34" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M25 128c5-27 22-41 39-41 21 0 38 14 39 41H25Z" fill={shirt} />
        <path d="M56 100c3 4 8 6 8 6s5-2 8-6" fill="none" stroke="#F8F6F2" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
