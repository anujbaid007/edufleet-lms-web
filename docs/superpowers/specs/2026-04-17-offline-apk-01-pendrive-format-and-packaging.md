# Offline APK — Sub-project #1: Pendrive Binary Format & Packaging CLI

**Date:** 2026-04-17
**Status:** Draft — pending user review
**Parent:** [2026-04-17-offline-apk-umbrella-architecture.md](./2026-04-17-offline-apk-umbrella-architecture.md)

---

## Purpose

Define the on-disk format of the EduFleet encrypted pendrive and build the two-stage CLI tool that produces it. Every other sub-project (panel activation, credentials, APK player, sync) consumes the contracts defined here. This is the foundation layer — specced first, built first.

---

## Scope

### In scope

- Two local Node CLIs (extending the existing `scripts/` pattern):
  - `scripts/pendrive-prepare-content.ts` — stage 1, encrypts content once into a reusable local "content pack" folder
  - `scripts/pendrive-stamp.ts` — stage 2, copies a content pack onto a specific USB + writes per-pendrive signed metadata
- Binary formats: `.edfv` (video), `.edfq` (quiz), `.edft` (thumbnail)
- Metadata formats: `manifest.json.sig`, `credentials.edfc`
- Key derivation hierarchy (HKDF chain from the master secret)
- Ops runbook: where the master secret + signing key live, rotation path

### Out of scope (handled in later sub-projects)

- APK-side reading / validation of these formats → sub-project #3 (credentials) and #4 (player)
- Panel activation codes → sub-project #2
- Web UI for generating pendrives → phase-2, not MVP
- Delta / incremental pendrive updates → explicitly deferred per umbrella
- HLS support on pendrive → we ship single-MP4-per-video only; adaptive bitrate is a connectivity feature and pendrive playback is local-file

---

## Operator model

- **One operator**: the EduFleet platform admin, working on a single provisioning workstation.
- **Workstation requirements**: macOS or Linux; Node 20+; this repo cloned; `.env.provisioning` containing `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `EDUFLEET_MASTER_KEY` (hex, 32 bytes), `EDUFLEET_SIGNING_PRIVATE_KEY` (Ed25519 PEM).
- **Trust boundary**: this workstation is a signing machine. Full-disk encryption mandatory; `.env.provisioning` never committed, never synced to cloud. Credentials kept in a password manager with offline encrypted backup. (See Ops Runbook below.)

---

## Stage 1 — `pendrive-prepare-content`

### Purpose

Produce a reusable encrypted content pack on the admin's local HDD. Run once per content configuration (e.g., "Class 6–8 English"); reused across all pendrives that carry that configuration.

### Invocation

```
npm run pendrive:prepare-content -- \
  --class 6,7,8 \
  --medium english \
  --board CBSE \
  --subjects maths,science,english \      # optional; defaults to all subjects with chapters matching filters
  --output ~/edufleet-content/class-6-8-english/ \
  [--resume]                               # optional; skip videos already encrypted in the output folder
```

### Behaviour

1. Validate args (classes are integers 0–12, medium in `english`/`hindi`/`both`, output is a writable empty dir or `--resume` was passed).
2. Query Supabase via service-role for every chapter matching `(class IN classes, medium, board)` and for each chapter pull videos + `chapter_quizzes` + `quiz_questions`.
3. Generate a fresh `content_bundle_id` (16 random bytes → lowercase hex UUID). If `--resume` and a partial manifest exists, reuse the existing ID.
4. For each video:
   - Download from S3 to a temp path (streamed, not buffered).
   - Derive per-video keys (see Key Derivation below).
   - Encrypt chunk-by-chunk into `<output>/content/videos/<video_id>.edfv` (see `.edfv` layout).
   - Delete temp file on success; keep on failure for debugging.
5. For each chapter that has a published quiz: serialize questions to compact JSON, encrypt as a whole with AES-256-GCM, write to `<output>/content/quizzes/<chapter_id>.edfq`.
6. For each video with a thumbnail in S3: encrypt + write to `<output>/content/thumbnails/<video_id>.edft`.
7. Emit `<output>/content-pack-manifest.json` (unsigned, local use only) containing the full catalogue (subjects, chapters, videos, quiz availability, durations, titles in English + Hindi).
8. Print a summary: X videos, Y quizzes, total plaintext size, total encrypted size, total duration on disk.

### Resumability

- Stage 1 is designed to be rerun after a crash. Each `.edfv`/`.edfq`/`.edft` is written atomically (`.partial` then rename); on startup with `--resume`, the CLI scans the output dir, and only re-does items that aren't complete.
- `content_bundle_id` is frozen on first run and stored in `content-pack-manifest.json`. Resume keeps the same ID so already-encrypted files remain valid.

### Output folder layout

```
~/edufleet-content/class-6-8-english/
├── content-pack-manifest.json        (local use only; NOT copied to USB as-is)
└── content/
    ├── videos/<video_id>.edfv
    ├── quizzes/<chapter_id>.edfq
    └── thumbnails/<video_id>.edft
```

---

## Stage 2 — `pendrive-stamp`

### Purpose

Take a prepared content pack + a specific centre + specific teachers + a mounted USB, and produce a ready-to-ship pendrive. Run once per USB; fast (USB write is the dominant cost).

### Invocation

```
npm run pendrive:stamp -- \
  --content-folder ~/edufleet-content/class-6-8-english/ \
  --centre <centre-uuid> \
  --teachers <teacher-uuid>:<password>,<teacher-uuid>:<password> \
  --usb /Volumes/PENDRIVE \
  [--wipe]                            # required if USB has an existing .edufleet/ with a different pendrive_id
```

If `--teachers` is omitted, the CLI prompts interactively for each teacher assigned to the centre, and offers to auto-generate strong random passwords (prints them once so admin can distribute out-of-band).

### Behaviour

1. Validate:
   - `--content-folder` contains a valid `content-pack-manifest.json` with a known format version.
   - `--usb` is mounted, writable, formatted as **exFAT** (detected by `diskutil info` on macOS / `lsblk -f` on Linux). Any other filesystem → abort with explicit reformat instructions.
   - `--usb` free space ≥ 1.1 × sum of content file sizes.
   - Centre exists in Supabase; every teacher UUID is a teacher belonging to that centre.
2. Generate `pendrive_id` (16 random bytes).
3. Copy `<content-folder>/content/` → `<usb>/content/` (streamed per-file with progress bar; verified by byte count). Skip files already present if their SHA-256 matches and `--wipe` isn't set.
4. Build the signed manifest (see `manifest.json.sig` schema) and write to `<usb>/.edufleet/manifest.json.sig`.
5. For each teacher: derive argon2id KEK from their password, wrap their signed credential, collect into `credentials.edfc` (see schema), write to `<usb>/.edufleet/credentials.edfc`.
6. Write `<usb>/.edufleet/version.txt` with `format_version=1`.
7. Read back `manifest.json.sig`, verify signature, fail loudly if mismatch (guards against silent USB corruption during write).
8. Print a receipt: pendrive_id, centre name, teacher usernames + passwords (if generated), total size, "safe to eject."
9. Force `sync(2)` / `diskutil unmount` before exit so admin doesn't pull the USB mid-write.

---

## On-disk pendrive layout

```
PENDRIVE_ROOT/  (exFAT)
├── .edufleet/
│   ├── manifest.json.sig     (signed catalogue + centre binding + crypto params)
│   ├── credentials.edfc      (password-wrapped signed teacher credentials)
│   └── version.txt           (format_version=1)
└── content/
    ├── videos/<video_id>.edfv
    ├── quizzes/<chapter_id>.edfq
    └── thumbnails/<video_id>.edft
```

The `.edufleet/` prefix makes these files appear with a leading dot (hidden from casual OS file browsers on most platforms). Nothing else is on the pendrive; no autorun, no installer, no plaintext hints about the content.

---

## Cryptographic design

### Key derivation hierarchy

All keys derive from the **32-byte master secret** `M`, which is:
- Stored in `.env.provisioning` on the workstation (CLI reads it).
- Embedded in the APK's NDK `libedufleet.so` at build time (sub-project #4).

```
M                     : 32 random bytes, never changes without a coordinated rotation
content_bundle_id (CB): 16 random bytes, plaintext in manifest, one per content pack
video_id (V)          : UUID, plaintext in manifest
chapter_id (C)        : UUID, plaintext in manifest

content_key           = HKDF-SHA256(ikm=M, salt=CB,  info="edufleet/content/v1",   len=32)
video_enc_key  (V)    = HKDF-SHA256(ikm=content_key, salt=V, info="edufleet/video/enc/v1",  len=32)
video_mac_key  (V)    = HKDF-SHA256(ikm=content_key, salt=V, info="edufleet/video/mac/v1",  len=32)
quiz_key       (C)    = HKDF-SHA256(ikm=content_key, salt=C, info="edufleet/quiz/v1",       len=32)
thumb_key      (V)    = HKDF-SHA256(ikm=content_key, salt=V, info="edufleet/thumb/v1",      len=32)
```

Since `CB`, `V`, `C` are all in the manifest (plaintext), the APK can derive every key it needs given only `M`. No separate key file on the pendrive.

Rotation of `M` invalidates every existing pendrive against the new APK build — the accepted break-glass path.

### `.edfv` — video file layout (chunked CTR + HMAC)

Designed for **random-access playback**: ExoPlayer's `DataSource` needs `read(offset, length)` semantics, which a chunked format supports cleanly.

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER (fixed 128 bytes, plaintext)                              │
│   magic              : "EDFV"      (4 bytes)                     │
│   format_version     : u16 BE      (2)                           │
│   reserved           : u16 BE      (2)  — must be 0              │
│   content_bundle_id  : 16 bytes                                  │
│   video_id           : 16 bytes (UUID bytes)                     │
│   chunk_size         : u32 BE      (4)  — plaintext chunk, 262144│
│   plaintext_size     : u64 BE      (8)                           │
│   chunk_count        : u32 BE      (4)                           │
│   reserved2          : 40 bytes    — padding to 128              │
│   header_hmac        : 32 bytes    — HMAC-SHA256(video_mac_key,  │
│                                      all prior bytes)             │
├──────────────────────────────────────────────────────────────────┤
│ CHUNK 0                                                          │
│   ciphertext : chunk_size bytes (AES-256-CTR)                    │
│   tag        : 32 bytes (HMAC-SHA256(video_mac_key,              │
│                          chunk_index_be32 || ciphertext))        │
├──────────────────────────────────────────────────────────────────┤
│ CHUNK 1 …                                                        │
│ …                                                                │
│ CHUNK (chunk_count - 1)   — may be shorter than chunk_size       │
└──────────────────────────────────────────────────────────────────┘
```

**CTR IV derivation** (deterministic, no IV stored on disk):
```
iv(V, chunk_index) = SHA-256(video_enc_key || "iv" || chunk_index_be32)[:16]
```
CTR counter starts at 0 within the chunk. Since every `video_enc_key` is unique per video and `iv` is unique per chunk, keystream collisions are impossible.

**Why CTR + HMAC instead of GCM?** GCM's 96-bit nonce safety envelope is tight for long files; CTR + HMAC is textbook, decrypts streamily, and the extra 32-byte-per-chunk overhead is negligible (0.01% at 256 KiB chunks).

**Why 256 KiB chunks?** Balances:
- Seek granularity on the APK side (worst-case 256 KiB of wasted decrypt per seek).
- Overhead (32-byte tag per chunk = ~0.01% bloat).
- Memory use during decrypt (one chunk in RAM at a time).

**Byte offset math for chunk N on disk:**
```
chunk_offset(N) = 128 + N * (chunk_size + 32)
```
For the last chunk: `chunk_size_last = plaintext_size - (chunk_count - 1) * chunk_size`.

### `.edfq` — quiz file layout (single-blob GCM)

Quizzes are small (typical chapter quiz: 10–30 MCQs, few KB of JSON). Encrypt as a single AES-256-GCM blob.

```
┌──────────────────────────────────────────┐
│ magic            : "EDFQ" (4 bytes)      │
│ format_version   : u16 BE                │
│ reserved         : u16 BE                │
│ chapter_id       : 16 bytes              │
│ iv               : 12 bytes (random)     │
│ ciphertext_size  : u32 BE                │
│ ciphertext       : ciphertext_size bytes │
│ tag              : 16 bytes (GCM tag)    │
└──────────────────────────────────────────┘
```

Plaintext is a JSON object:
```json
{
  "chapter_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "text": "…",
      "options": ["A", "B", "C", "D"],
      "correct_option": 2,
      "difficulty": "easy" | "medium" | "hard" | null,
      "cognitive_level": "remember" | "understand" | … | null,
      "sort_order": 0
    }
  ]
}
```

Schema mirrors existing `quiz_questions` table columns; APK-side schema validator rejects unknown fields.

### `.edft` — thumbnail file layout

Same envelope as `.edfq` (`magic="EDFT"`, video_id instead of chapter_id). Plaintext is the raw JPEG/WebP bytes.

### `manifest.json.sig` — the pendrive's signed catalogue

Binary envelope:
```
┌──────────────────────────────────┐
│ magic            : "EDFM" (4)    │
│ format_version   : u16 BE        │
│ reserved         : u16 BE        │
│ json_size        : u32 BE        │
│ json             : UTF-8 JSON    │
│ sig              : 64 bytes      │  ← Ed25519(EduFleet signing priv, SHA-256(magic..json))
└──────────────────────────────────┘
```

JSON body (`canonical serialisation: sorted keys, no whitespace`):
```json
{
  "format_version": 1,
  "pendrive_id": "uuid",
  "content_bundle_id": "uuid",
  "centre_id": "uuid",
  "centre_name": "…",
  "org_id": "uuid",
  "org_name": "…",
  "issued_at": "2026-04-17T10:00:00Z",
  "issued_by": "platform_admin_user_id",
  "catalogue": {
    "subjects": [
      {
        "id": "uuid",
        "name": "Maths",
        "name_hindi": "गणित",
        "icon_key": "…",
        "chapters": [
          {
            "id": "uuid",
            "class": 6,
            "board": "CBSE",
            "medium": "English",
            "chapter_no": 1,
            "title": "…",
            "title_hindi": "…",
            "videos": [
              {
                "id": "uuid",
                "title": "…",
                "title_hindi": "…",
                "duration_seconds": 420,
                "sort_order": 0,
                "has_thumbnail": true
              }
            ],
            "quiz": {
              "id": "uuid",
              "question_count": 15
            } | null
          }
        ]
      }
    ]
  },
  "crypto": {
    "cipher": "aes-256-ctr+hmac-sha256",
    "chunk_size": 262144,
    "kdf": "hkdf-sha256",
    "info_version": "v1"
  }
}
```

The APK verifies the Ed25519 signature against the pubkey hardcoded in its NDK. Tampered manifest → APK refuses to mount the pendrive.

### `credentials.edfc` — password-wrapped teacher credentials

Binary envelope:
```
┌──────────────────────────────────┐
│ magic            : "EDFC" (4)    │
│ format_version   : u16 BE        │
│ reserved         : u16 BE        │
│ json_size        : u32 BE        │
│ json             : UTF-8 JSON    │
│ sig              : 64 bytes      │  ← Ed25519 over the file body, ties it to pendrive_id
└──────────────────────────────────┘
```

JSON body:
```json
{
  "format_version": 1,
  "pendrive_id": "uuid",
  "centre_id": "uuid",
  "issued_at": "2026-04-17T10:00:00Z",
  "entries": [
    {
      "teacher_display_name": "Aarti Sharma",
      "teacher_id_hint": "<first 8 chars of sha256(teacher_id)>",
      "argon2_salt": "<base64 16 bytes>",
      "argon2_params": { "m_cost_kib": 65536, "t_cost": 3, "p_cost": 1 },
      "wrapped_iv": "<base64 12 bytes>",
      "wrapped_ciphertext": "<base64>",
      "wrapped_tag": "<base64 16 bytes>"
    }
  ]
}
```

`teacher_display_name` is plaintext because the login screen is a **"tap-your-name, then type password"** picker (natural UX for a shared classroom panel). This exposes the list of enrolled teachers at that centre to anyone with physical USB access, which is acceptable: the same list is visible on the admin dashboard, and the device is already physically in that centre.

`teacher_id_hint` lets the APK index entries without a full scan during unwrap; it's a partial hash with no collision risk inside a single centre's teacher set and leaks nothing the display name doesn't already.

**Credential plaintext** (what's inside `wrapped_ciphertext` once unwrapped):
```json
{
  "format_version": 1,
  "credential_id": "uuid",
  "teacher_id": "uuid",
  "teacher_name": "…",
  "centre_id": "uuid",
  "org_id": "uuid",
  "role": "teacher",
  "issued_at": "2026-04-17T10:00:00Z",
  "expires_at": "2027-04-17T10:00:00Z",
  "sig": "<base64 64 bytes Ed25519 over canonical json of above fields>"
}
```

Login flow (for reference, specced in sub-project #3):
1. Teacher types username + password.
2. APK looks up matching `entries` by `teacher_id_hint`.
3. For each match, derive KEK via argon2id; try to unwrap with AES-256-GCM.
4. On first successful unwrap: verify Ed25519 signature → check `expires_at` vs device clock (+ monotonic anchor) → check `centre_id` matches panel's activated centre.
5. If any check fails, deny login with a generic "invalid credentials" message (don't leak which check failed — timing side channel deterrent).

### Cryptographic primitives used

| Purpose | Primitive | Implementation |
|---|---|---|
| Key derivation | HKDF-SHA256 | Node `crypto.hkdfSync` |
| Video content encryption | AES-256-CTR | Node `crypto.createCipheriv('aes-256-ctr', …)` |
| Video chunk integrity | HMAC-SHA256 | Node `crypto.createHmac('sha256', …)` |
| Quiz / thumbnail encryption | AES-256-GCM | Node `crypto.createCipheriv('aes-256-gcm', …)` |
| Manifest / credentials signing | Ed25519 | Node `crypto.sign('ed25519', …)` |
| Password → KEK | argon2id | `argon2` npm package |

All standard, all well-audited. No home-rolled crypto.

---

## Error handling & edge cases

- **S3 video missing** → log, skip that video, continue; record in the failure report at the end. Do not abort the whole run.
- **Network interruption during S3 download** → exponential backoff, 5 retries per object, then fail that object.
- **Disk full during stage 1** → abort immediately, leave partial output intact for `--resume`.
- **USB full during stage 2** → abort, print "wipe and retry with larger USB." Partial writes on the USB are left in place; `--wipe` on next run cleans them.
- **Invalid `--teachers` format** → exit with usage help, no files touched.
- **Teacher does not belong to `--centre`** → reject with explicit error naming the teacher and their actual centre.
- **Workstation clock is wrong** → `issued_at` would be wrong. CLI refuses to run if the workstation clock is > 24 hours off NTP (checked via `ntpdate -q` or equivalent); can be force-overridden with `--trust-local-clock` for air-gapped runs.
- **Duplicate run** → stage 2 without `--wipe` and a pre-existing pendrive → prompt for confirmation naming the old and new `pendrive_id`.
- **Interrupted stage 2** → USB is in an inconsistent state; APK detects this via missing / unsigned manifest and refuses to mount. Re-run stage 2 with `--wipe`.

---

## Logging & observability

- Every CLI run writes a structured JSON log to `~/.edufleet/logs/<stage>-<iso-timestamp>.log`.
- Log entries include content_bundle_id / pendrive_id, centre_id, teacher IDs (never passwords), file counts, total bytes, duration, errors.
- Stdout emits human-friendly progress bars (using `cli-progress` or similar).
- On success, stage 2 prints a **receipt** to stdout; on failure, the last 50 log lines.

---

## Ops runbook

### Master secret (`EDUFLEET_MASTER_KEY`)

- Generated once: `openssl rand -hex 32`.
- Stored in three places, nowhere else:
  1. Workstation `.env.provisioning` (chmod 600, FileVault on).
  2. An offline encrypted password-manager vault (e.g., a 1Password / Bitwarden "secure note" marked offline-only).
  3. An air-gapped backup (printed on paper, sealed envelope, locked drawer) — for disaster recovery if both (1) and (2) are lost.
- Embedded in the APK NDK at build time from an environment variable in the Android CI (future sub-project #4 handles this).
- **Never** in Git. **Never** in Slack / email / shared Drive. **Never** synced to iCloud / OneDrive / Google Drive.

### Signing key (`EDUFLEET_SIGNING_PRIVATE_KEY`)

- Ed25519 keypair generated once: `openssl genpkey -algorithm ed25519 -out edufleet-sign.pem`.
- Private half: stored the same way as the master secret.
- Public half: checked into the repo at `src/lib/offline/edufleet-sign.pub.pem` and into the APK NDK source.
- Pubkey rotation requires an APK release; planned cadence is "only if compromised."

### Workstation hardening

- Full-disk encryption on.
- OS login password, auto-lock after 5 min.
- Separate user account used only for provisioning, no browser history / email / chat on it.
- No cloud sync of `~/edufleet-content/` or `~/.edufleet/` directories.
- CLI refuses to run if it detects it's executing in CI or inside a Docker container (sanity check — provisioning must happen on a known physical workstation).

### Key rotation

- Trigger: suspected master key leak.
- Steps:
  1. Generate new `M` + new Ed25519 keypair.
  2. Update workstation `.env.provisioning`.
  3. Bump `format_version` to 2; update APK NDK with new keys + new version.
  4. Publish APK update.
  5. Regenerate all pendrives against the new keys.
  6. Once all field panels have received the APK update, old pendrives stop working (their signatures fail under the new pubkey).
- Understand this is a multi-week ops exercise; the `M` is a jewel, protect it accordingly.

---

## What this sub-project does NOT implement

Filed as forward-dependencies for later sub-projects, listed here so reviewers can verify the contracts close cleanly:

- **Sub-project #2 (panel activation)** will add the activation-code signing on the web admin side, consuming the same Ed25519 signing key defined here.
- **Sub-project #3 (credentials)** will build the APK-side unwrap / verify flow against the `credentials.edfc` format defined here.
- **Sub-project #4 (APK shell + player)** will implement the NDK decrypt module matching the `.edfv` layout defined here, and will read `manifest.json.sig` to build the in-app catalogue.
- **Sub-project #5/#6 (analytics + sync)** do not interact with the pendrive format.

---

## Open questions (raise during implementation, not here)

- **Exact argon2id params**: the spec uses `m=64 MB, t=3, p=1`. Android smart panels are CPU-weak; we may need to reduce `m_cost` to 32 MB on weaker hardware. Final tuning after benchmarking on target devices in sub-project #3.
- **Whether to ship Hindi audio as a separate file or muxed track**: existing schema has `s3_key_hindi` as a separate video. Stage 1 should treat each language as its own video and let the catalogue reference both; APK picks based on user language preference. Confirm during implementation.
- **Quiz image support**: current schema has no image columns. If images are added later, the `.edfq` format will need to bump `format_version`.
- **Progress bar UX for multi-hour encrypt runs**: whether to support `--json-output` for programmatic wrapping in a future UI; decide when / if that need appears.
