# EduFleet Offline APK — Umbrella Architecture

**Date:** 2026-04-17
**Status:** Draft — pending user review

---

## Purpose of this document

This is the **umbrella architecture** for shipping an offline EduFleet LMS experience on Android smart panels and smart TVs used in classrooms without reliable internet. It defines:

- The subsystems the project decomposes into
- The contracts between them (so each can be specced and built independently)
- The cross-cutting design decisions (crypto, licensing, analytics sync, storage)
- The threat model and documented tradeoffs
- The implementation order

This is **not** an implementation plan. Each subsystem listed below gets its own detailed spec + implementation plan cycle after this umbrella is approved.

---

## Context & goal

EduFleet already runs as a Next.js + Supabase web LMS for CSR/NGO-run education centres. Videos live on S3 and are served as HLS with short-lived session URLs. Analytics roll up per organization → centre → class → chapter.

In many target centres, internet is intermittent or absent. The goal is to put EduFleet's video + quiz library on an **encrypted USB pendrive** and run the classroom experience on an **Android-based smart panel or smart TV** with a native APK. Teachers log in offline with admin-issued credentials. When the device does come online, the teacher can tap "Refresh" to push captured analytics to the central DB, so CSR/NGO admin dashboards reflect real classroom usage.

### In scope

- Teacher-facing offline video player + quiz runner on Android smart panels/TVs
- Encrypted USB pendrive as the content delivery medium (read-only during normal use)
- Offline login against admin-issued, password-wrapped, signed credentials
- Offline analytics capture (watch events, quiz attempts, logins)
- Manual-trigger online sync of analytics back to the central Supabase DB
- Admin-side content packaging pipeline (web-initiated + CLI tool) that writes encrypted content + credentials + licence metadata onto a pendrive
- Admin-side panel activation flow (offline, via signed activation codes)

### Out of scope

- Student-facing features on the panel (students continue to use the existing online web LMS)
- Quiz / content authoring on the panel
- Cross-pendrive content mixing on a single panel session
- Auto-updates of the panel APK (handled separately via Play Store or centre-level MDM; not part of this project)
- Protecting against determined reverse-engineers extracting the NDK master key (see threat model)

---

## Subsystems

The project decomposes into six independent subsystems. Each has a well-defined contract with its neighbours and is specced + implemented in its own cycle.

| # | Subsystem | Layer | Responsibility |
|---|-----------|-------|---------------|
| 1 | **Pendrive binary format & content packaging pipeline** | Admin-side (web + CLI) | Defines the on-disk format. Reads approved content from S3, encrypts videos + quizzes, writes manifest, credentials, licence metadata to a mounted USB. |
| 2 | **Panel activation + licence enforcement** | Web admin + APK | One-time offline setup that binds a panel to a centre. Blocks pendrives whose `centre_id` doesn't match. |
| 3 | **Offline credential system + 1-year enforcement** | APK | Reads signed credentials from pendrive, password-unlocks, enforces 365-day hard cap, defends against clock rollback. |
| 4 | **APK shell + encrypted player** | APK | Kotlin / Jetpack Compose for TV, navigation, ExoPlayer with a custom streaming-decryption DataSource. |
| 5 | **Offline analytics capture** | APK | Room/SQLite schema + hooks that record watch events, quiz attempts, logins. Respects storage budget. |
| 6 | **Online sync API + ingest** | Web (Next.js + Supabase) | New API route that receives batched offline events, idempotent-merges into existing `video_progress` / analytics tables, returns refreshed credential/licence lists. |

---

## Key design decisions

### Tech stack (APK)

- **Language:** Kotlin
- **UI:** Jetpack Compose for TV (touch-first, D-pad fallback)
- **Player:** Media3 ExoPlayer with a custom `DataSource` that decrypts chunks in memory
- **Local DB:** Room (SQLite with WAL)
- **Native crypto / key storage:** NDK (C/C++) module for master key + sensitive derivations
- **Keystore:** Android Keystore for device fingerprint, monotonic clock anchor, panel licence blob
- **`minSdk` 26 / `targetSdk` 34** — covers virtually all Android-based smart panels and modern smart TVs

### Cryptographic model (option C — universal binding, hardened)

A single **master secret** `M` is embedded in the APK via NDK. All other keys derive from `M`.

```
M                     : 32-byte master secret, baked into libedufleet.so
pendrive_id (P)       : 16-byte random per pendrive (in manifest, plaintext)
video_id (V)          : UUID of a given video

content_key (CK_P)    = HKDF-SHA256(M, salt=P, info="edufleet/content")
video_key (VK_V)      = HKDF-SHA256(CK_P, salt=V, info="edufleet/video")
video_mac_key (MK_V)  = HKDF-SHA256(CK_P, salt=V, info="edufleet/video-mac")
```

**Cipher:** AES-256-CTR + HMAC-SHA256 (encrypt-then-MAC), applied per fixed-size chunk (256 KiB) so ExoPlayer can seek/scrub without decrypting the whole file. Each chunk has an inline 32-byte HMAC tag; a tampered chunk fails validation and playback halts on that chunk.

**Why CTR + HMAC over AES-GCM?** CTR + HMAC streams more cleanly for HLS/MP4 seek operations without carrying GCM's 128-bit-limit-per-IV constraint across chunks; in practice the pattern is well-understood, easy to implement on both the packaging side (Node/TS) and the decrypt side (NDK C).

### Credential format

Each authorised teacher has a signed credential written to the pendrive:

```
credential = {
  credential_id    : uuid
  teacher_id       : uuid
  teacher_name     : string
  centre_id        : uuid
  org_id           : uuid
  role             : "teacher"
  issued_at        : iso8601
  expires_at       : iso8601   // = issued_at + 365 days
  sig              : Ed25519(EduFleet private key, sha256(rest of credential))
}
```

The credential is then **password-wrapped**:

```
salt_t   = 16 random bytes (per teacher)
KEK_t    = argon2id(password, salt_t, memory=64MB, iters=3, parallelism=1)
wrapped  = AES-256-GCM(KEK_t, serialize(credential))
```

The pendrive's `credentials.edfc` file contains: `[{ teacher_id_hint, salt_t, wrapped_credential }, ...]` — no plaintext passwords, no plaintext credentials at rest. Login = derive KEK from typed password → try to unwrap → check signature → check expiry.

The **EduFleet Ed25519 verifying pubkey** is hardcoded in the NDK module. A compromised private key would require rotating the pubkey in the APK, which means a Play Store / MDM update — that's the accepted key-rotation path.

### Panel activation (licence binding)

A panel is tied to a centre via a one-time offline activation:

```
activation_code = {
  centre_id              : uuid
  device_fingerprint_hash: sha256(Android_ID || Build.MODEL || Build.SERIAL)
  issued_at              : iso8601
  sig                    : Ed25519(EduFleet private key, sha256(rest))
}
```

**Flow:**

1. Installer opens APK → setup wizard shows panel's device fingerprint (derived + truncated for human entry; full form computed internally).
2. Installer relays fingerprint to EduFleet admin.
3. Admin enters it into the web LMS, which issues the signed activation code.
4. Installer enters the code into the panel.
5. APK verifies signature and fingerprint match, stores the blob in **Android Keystore** as non-exportable data.
6. Panel is now permanently "a Centre X panel."

Every pendrive carries a signed `centre_id` in its manifest. Every playback attempt, the APK checks `pendrive.centre_id == panel.activated_centre_id`. Mismatch → playback refused with "This pendrive is not licensed for this panel."

### Expiry + clock tamper

- **Hard cap:** 365 days from credential `issued_at`. After `expires_at`, the credential fails validation, teacher can't log in. Admin reissues by generating a new pendrive (or by pushing a fresh credential list via online sync).
- **Clock rollback defence:** On every app foreground, the APK reads a monotonic "last-seen" timestamp from Android Keystore, writes the current timestamp, and if the new value is earlier than (last_seen - 5 min) the app locks with a "Device clock tampered — please correct system time" dialog.
- **Clock forward:** We do not defend against forward clock movement. Pushing the clock forward only shortens the teacher's access (hits `expires_at` sooner), which is self-defeating for the attacker.

### Revocation

- **Offline:** no revocation possible until the device syncs online. The 365-day hard cap is the offline backstop.
- **Online:** the Refresh/Sync call also downloads an updated credential list for this centre. Local cache is replaced. A teacher whose server-side status is revoked simply won't appear in the next credential list — they can still use the original pendrive's credential offline until it expires or is removed, but any refreshed device drops them.

### Analytics capture & sync

- **Local DB:** Room, with two tiers:
  - **Event log** (append-only): one row per user action — watch heartbeat (every 30 s during playback), video start/end, seek, quiz start/answer/submit, login/logout, error.
  - **Rollups** (upsert-only): `video_progress` row per (teacher_id, video_id), `quiz_results` per (teacher_id, quiz_id, attempt_id). These mirror the existing server-side shape, so sync merges cleanly.
- **Event schema includes:** `client_event_id` (UUID v4), `panel_id`, `centre_id`, `teacher_id`, `event_type`, `event_payload` (compact columns, minimal JSON), `occurred_at`, `captured_at`.
- **Sync trigger:** manual — "Refresh" button on the teacher's home screen. Batches up to 5,000 events per request, retries on failure, pruned on server ack.
- **Idempotency:** server dedupes by `client_event_id`; same row can be synced twice without double-counting.
- **Back-channel:** sync response carries (a) refreshed credential list for this centre, (b) current server time (anchors the monotonic check), (c) optional force-lock flag if the panel itself is disabled.

### Storage budget

- **Event log:** ~100–150 KB per active day. Prune on successful sync.
- **Rollups:** ~75 KB total, doesn't grow with usage (one row per teacher × video).
- **Soft cap:** 25 MB — above this, show a banner asking teacher to connect + refresh.
- **Hard cap:** 100 MB — event capture pauses (rollups still update) until a sync succeeds and drains the queue.
- **APK size:** ~15–25 MB.
- **Content:** zero panel storage; all on pendrive.

### Hot-swap of pendrives

- Only one pendrive mounted at a time. Swapping is supported — APK listens for USB mount/unmount events, re-reads manifest, re-validates `centre_id`, reloads catalogue.
- Active playback is stopped cleanly on unmount (no dangling decrypt streams).

---

## Data flow

```
0. ONE-TIME PANEL ACTIVATION (offline, per panel)
   Installer opens APK → sees device fingerprint
     → relays to EduFleet admin
     → admin issues signed activation code
     → installer types into APK
     → APK verifies + stores in Android Keystore
     → panel is now bound to centre X

1. ONE-TIME PENDRIVE GENERATION (admin-side, per pendrive)
   Admin selects centre + teachers + class/subjects/chapters in web LMS
     → clicks "Generate Pendrive" (with a USB mounted)
     → packaging pipeline pulls videos from S3
     → derives keys via HKDF(M, pendrive_id)
     → encrypts videos (chunked CTR + HMAC) + quizzes + metadata
     → writes signed manifest + signed credentials file
     → pendrive ready to ship

2. DAILY USE (offline, in the classroom)
   Teacher inserts pendrive → APK validates pendrive centre_id matches panel
     → teacher enters username + password
     → APK unwraps credential via argon2id(password, salt)
     → verifies signature + expiry + clock monotonicity
     → shows content catalogue (read from manifest)
     → teacher plays a video
     → ExoPlayer + custom DataSource stream-decrypts each chunk in memory
     → watch events + quiz events flow into Room

3. PERIODIC SYNC (when device is online, manual trigger)
   Teacher taps "Refresh"
     → APK POSTs batched events to /api/offline/sync with panel licence blob + device attestation
     → server verifies panel licence, dedupes by client_event_id, merges into video_progress / quiz results / analytics
     → server returns refreshed credential list + server time + force-lock flag
     → APK overwrites local credential cache, anchors monotonic clock, prunes synced events
     → CSR/NGO admin dashboard now reflects the centre's offline usage
```

---

## Threat model

### Threats we actively defend against

- A teacher (or student) copying `.edfv` files off the pendrive and trying to play them in VLC → defeated by encryption.
- A teacher sharing their password → defeated only partially (anyone with the password and the pendrive can log in; this is a business/policy concern).
- A device being moved to another centre and used as-is → defeated by panel-to-centre binding.
- An NGO buying one licence and rotating the pendrive across unrelated centres → defeated by panel activation binding each panel to a centre and pendrive manifests carrying a signed `centre_id`.
- A terminated teacher continuing to teach from their existing pendrive forever → limited by the 365-day hard cap; eliminated on next online sync.
- Clock rollback to extend access past `expires_at` → defeated by monotonic Keystore anchor.
- Activation-code reuse across panels → defeated by fingerprint binding in the signed code.
- An attacker intercepting an analytics sync request → requests are over HTTPS, signed with the panel licence; server rejects replays via nonce.

### Threats we explicitly do NOT defend against (documented tradeoffs)

- **Determined reverse engineer** extracting the NDK master key from `libedufleet.so` with IDA Pro / Ghidra and building a parallel decryption tool. This is option C's accepted tradeoff. Mitigations (NDK placement, R8 full-mode, string encryption, anti-debug, Play Integrity) raise the bar; they do not eliminate this risk.
- Nation-state adversaries.
- Physical tamper attacks on the panel (rooting, custom ROM extracting Keystore contents).
- A malicious NGO admin who legitimately purchases N panel activations and N pendrives and chooses to share them against the intent of the licensing — this is a business/legal issue, not a technical one.

### Hardening checklist (binding on the APK subsystem spec)

- Master key only in NDK code, never passes through JVM/Kotlin
- Per-file keys derived fresh; never cached to disk
- R8 full-mode obfuscation + resource shrinking
- String encryption (DexGuard or equivalent) for sensitive literals
- `android:debuggable="false"`, `android:allowBackup="false"`
- Anti-debug checks (`ptrace` self-attach, `TracerPid` monitor)
- Root detection + emulator detection → refuse to run
- Play Integrity API attestation on every online sync call (and gate credential refresh on a passing verdict)
- Certificate pinning on sync requests

---

## Implementation order

Each subsystem is specced + planned + implemented separately. Order matters because later subsystems consume the contracts of earlier ones.

1. **Pendrive binary format & content packaging pipeline** — foundation. Defines what's on the disk, which everything downstream reads.
2. **Panel activation + licence enforcement** — second, because the APK's first-run wizard depends on it.
3. **Offline credential system + 1-year enforcement** — third; consumes the credential file format from step 1.
4. **APK shell + encrypted player** — largest piece; consumes steps 1–3.
5. **Offline analytics capture** — additive; integrated into the APK shell.
6. **Online sync API + ingest** — closes the loop; adds the `/api/offline/sync` route to the existing Next.js app.

This umbrella covers the system as a whole. Next step: a detailed spec for subsystem #1 (pendrive binary format + content packaging pipeline), followed by its own implementation plan.

---

## Open questions (to resolve in sub-specs, not here)

These are deliberately deferred until we dig into each subsystem:

- Exact binary layout of the pendrive (file tree vs single packed archive, TOC encoding, chunk size tuning).
- Content-packaging UI location: extend the existing admin section or a separate internal tool?
- How quiz content is packaged (current quiz schema into an offline-friendly format, image assets, MCQ randomization determinism).
- Sync batching & retry strategy details (exponential backoff, max batch size, partial-success semantics).
- Supabase row-level policy changes needed for the ingest endpoint (likely a service-role-only server-side route).
- APK update / distribution channel (Play Store, private MDM, sideload).
- Per-panel device fingerprint ambiguity on Android 10+ (where `ANDROID_ID` is scoped per-signing-key) — need to confirm fingerprint recipe still uniquely identifies panels.
