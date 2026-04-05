export const PROFILE_AVATAR_IDS = Array.from(
  { length: 30 },
  (_, index) => `avatar-${String(index + 1).padStart(2, "0")}`
);

export function defaultAvatarIdForUser(userId: string) {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return PROFILE_AVATAR_IDS[hash % PROFILE_AVATAR_IDS.length];
}
