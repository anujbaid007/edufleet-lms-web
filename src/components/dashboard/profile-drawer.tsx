"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Building2,
  Camera,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { updateOwnAvatar } from "@/lib/actions/profile";
import { defaultAvatarIdForUser, PROFILE_AVATAR_IDS } from "@/lib/profile-avatars";
import { ProfileAvatar } from "./profile-avatar";

type ProfileDrawerProps = {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  classNum: number | null;
  board: string | null;
  medium: string | null;
  phone: string | null;
  avatarUrl: string | null;
  organizationName: string | null;
  centreName: string | null;
  compact?: boolean;
};

function displayClass(classNum: number | null) {
  if (classNum === null) return "Not assigned";
  if (classNum === 0) return "Kindergarten";
  if (classNum === 99) return "General";
  return `Class ${classNum}`;
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-orange-primary/10 bg-white/80 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 shadow-sm">
          <Icon className="h-4 w-4 text-orange-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
          <p className="mt-1 text-sm font-semibold text-heading">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function ProfileDrawer({
  userId,
  name,
  email,
  role,
  classNum,
  board,
  medium,
  phone,
  avatarUrl,
  organizationName,
  centreName,
  compact = false,
}: ProfileDrawerProps) {
  const [open, setOpen] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(avatarUrl || defaultAvatarIdForUser(userId));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAvatarPreview(avatarUrl || defaultAvatarIdForUser(userId));
  }, [avatarUrl, userId]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleAvatarChange = (selectedAvatarId: string) => {
    setFeedback(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("avatarId", selectedAvatarId);

      const result = await updateOwnAvatar(formData);

      if (result?.error) {
        setFeedbackTone("error");
        setFeedback(result.error);
        return;
      }

      if (result?.avatarUrl) {
        setAvatarPreview(result.avatarUrl);
      }

      setFeedbackTone("success");
      setFeedback("Avatar updated.");
      setShowAvatarPicker(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "group relative flex h-11 w-11 items-center justify-center rounded-full border border-orange-primary/15 bg-white/90 p-0.5 shadow-[0_10px_24px_rgba(214,153,68,0.12)] transition hover:border-orange-primary/25 hover:bg-white"
            : "group flex items-center gap-3 rounded-full border border-orange-primary/10 bg-white/90 px-2.5 py-2 shadow-[0_14px_32px_rgba(214,153,68,0.10)] transition hover:border-orange-primary/20 hover:bg-white"
        }
        aria-label="Open profile"
      >
        <div className="relative">
          <ProfileAvatar
            avatarId={avatarPreview}
            size={compact ? 38 : 44}
            className="rounded-full"
          />
          <span
            className={
              compact
                ? "absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400"
                : "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400"
            }
          />
        </div>
        {!compact && (
          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold text-heading">{name}</p>
            <p className="text-xs capitalize text-muted">{role.replaceAll("_", " ")}</p>
          </div>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close profile"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-white/20 bg-gradient-to-br from-[#fffaf4] via-white to-[#fff5ea] shadow-[0_32px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between border-b border-orange-primary/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary">My Profile</p>
                <h2 className="mt-2 font-poppins text-xl font-bold text-heading">{name}</h2>
                <p className="mt-1 text-sm text-muted">Your learning identity and access details.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-muted shadow-sm transition hover:text-heading"
                aria-label="Close profile"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <section className="rounded-[28px] border border-orange-primary/10 bg-white/85 p-5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <ProfileAvatar avatarId={avatarPreview} size={96} className="rounded-[28px]" />
                    <button
                      type="button"
                      onClick={() => setShowAvatarPicker((current) => !current)}
                      className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-orange-primary shadow-[0_10px_24px_rgba(214,153,68,0.18)] transition hover:scale-[1.03]"
                      aria-label="Choose avatar"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-heading">{name}</p>
                    <p className="mt-1 text-sm capitalize text-muted">{role.replaceAll("_", " ")}</p>
                    <p className="mt-3 text-xs text-muted">
                      You can update only your display photo here. Your academic and centre details are managed by your admin.
                    </p>
                  </div>
                </div>

                {feedback ? (
                  <div
                    className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                      feedbackTone === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {feedback}
                  </div>
                ) : null}

                {showAvatarPicker ? (
                  <div className="mt-5 rounded-[28px] border border-orange-primary/10 bg-[#fff8f0] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-heading">Choose your avatar</p>
                        <p className="text-xs text-muted">Pick any avatar from the EduFleet collection.</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-orange-primary shadow-sm">
                        {PROFILE_AVATAR_IDS.length} options
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-3">
                      {PROFILE_AVATAR_IDS.map((avatarId) => {
                        const selected = avatarPreview === avatarId;
                        return (
                          <button
                            key={avatarId}
                            type="button"
                            onClick={() => handleAvatarChange(avatarId)}
                            className={`rounded-[24px] border p-1.5 transition ${
                              selected
                                ? "border-orange-primary bg-orange-50 shadow-[0_10px_24px_rgba(232,135,30,0.15)]"
                                : "border-orange-primary/10 bg-white hover:border-orange-primary/30 hover:bg-orange-50/40"
                            }`}
                          >
                            <ProfileAvatar avatarId={avatarId} size={56} className="rounded-[18px]" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Profile Details</p>
                <div className="grid gap-3">
                  <DetailCard icon={UserRound} label="Full Name" value={name} />
                  <DetailCard icon={Mail} label="Email ID" value={email ?? "Not available"} />
                  <DetailCard icon={Phone} label="Phone Number" value={phone ?? "Not provided"} />
                  <DetailCard icon={GraduationCap} label="Class" value={displayClass(classNum)} />
                  <DetailCard icon={GraduationCap} label="Board & Medium" value={[board, medium].filter(Boolean).join(" · ") || "Not assigned"} />
                  <DetailCard icon={Building2} label="Organization" value={organizationName ?? "Not assigned"} />
                  <DetailCard icon={MapPin} label="Centre" value={centreName ?? "Not assigned"} />
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
