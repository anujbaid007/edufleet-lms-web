# EduFleet Android TV App — Offline Encrypted Pen Drive Player

## Overview

Build an Android TV app that reads encrypted pen drives containing EduFleet video content, plays them for licensed users, tracks analytics locally, and syncs to the existing Supabase backend when online.

**Client:** NGOs receiving EduFleet content on encrypted pen drives.
**Platform:** Android TV (sideloaded APK).

---

## How It Works (End-to-End Flow)

```
1. NGO receives a pen drive with encrypted EduFleet content
2. NGO plugs pen drive into Android TV
3. App detects the pen drive
4. App checks: Is there a cached login session? (valid for 15-day sliding window)
   - If NO  → Prompts user to connect to internet and log in
   - If YES → Proceeds
5. App combines KEY_A (hardcoded in APK) + KEY_B (cached from server during login)
6. Decrypts content, displays video library organized by Class > Subject > Chapter
7. User watches videos, takes quizzes — all tracked locally
8. When internet is available, analytics sync to Supabase
```

---

## Encryption Strategy

### Two-Part Key Approach

The decryption key is split into two halves. Neither half alone can decrypt the content.

| Part | Where It Lives | When It's Available |
|------|---------------|-------------------|
| `KEY_A` | Hardcoded in the APK (obfuscated via ProGuard/R8) | Always |
| `KEY_B` | Stored on Supabase, sent to app during login | Cached locally for 15 days |

- **Encryption algorithm:** AES-256
- **Combined key:** `SHA-256(KEY_A + KEY_B)` → used as the actual AES key
- **Content encrypted once** when preparing the pen drive — the combined key never changes

### Why This Is Secure Enough

- Decompiling the APK only reveals `KEY_A` — useless alone
- `KEY_B` is only available to users with valid licenses
- License revoked on server → `KEY_B` stops being sent → within 15 days, app locks out
- If `KEY_B` is ever compromised, rotate it server-side + re-encrypt new pen drives

### Pen Drive Structure

```
USB Drive (FAT32/exFAT — standard format so Android TV can mount it)
├── .edufleet/
│   ├── manifest.enc          ← Encrypted index (maps random filenames → real metadata)
│   ├── a7f2c9e1.dat          ← Encrypted video: "Class 10 - Physics - Ch1"
│   ├── b3d8e4f2.dat          ← Encrypted video: "Class 10 - Physics - Ch2"
│   ├── c9a1b7d3.dat          ← Encrypted quiz: "Quiz - Newton's Laws"
│   ├── d4e5f6a7.dat          ← Encrypted video: "Class 10 - Chemistry - Ch1"
│   └── ... (hundreds of .dat files with random names)
```

**What a PC user sees:** A folder full of meaningless `.dat` files. No filenames, no structure, no playable media.

**What the app sees after decryption:** Full content library organized by class, subject, chapter, with video metadata, quiz questions, and sort orders.

### Manifest File Structure (Before Encryption)

```json
{
  "version": 1,
  "drive_id": "uuid-unique-to-this-drive",
  "created_at": "2026-05-10T00:00:00Z",
  "content": [
    {
      "file": "a7f2c9e1.dat",
      "type": "video",
      "class": 10,
      "board": "CBSE",
      "medium": "English",
      "subject": "Physics",
      "subject_hindi": "भौतिक विज्ञान",
      "chapter_no": 1,
      "chapter_title": "Light - Reflection and Refraction",
      "chapter_title_hindi": "प्रकाश - परावर्तन और अपवर्तन",
      "video_title": "Introduction to Light",
      "video_title_hindi": "प्रकाश का परिचय",
      "sort_order": 1,
      "duration_seconds": 600
    },
    {
      "file": "c9a1b7d3.dat",
      "type": "quiz",
      "class": 10,
      "board": "CBSE",
      "medium": "English",
      "subject": "Physics",
      "chapter_no": 1,
      "questions": [
        {
          "question_text": "What is the speed of light?",
          "option_a": "3 x 10^8 m/s",
          "option_b": "3 x 10^6 m/s",
          "option_c": "3 x 10^10 m/s",
          "option_d": "3 x 10^4 m/s",
          "correct_option": 1,
          "sort_order": 1
        }
      ]
    }
  ]
}
```

---

## Authentication & License Flow

### Login (One-Time Online)

```
User opens app for the first time (or session expired)
        ↓
App shows login screen → User enters email + password
        ↓
App calls Supabase auth.signInWithPassword()
        ↓
App fetches user profile → checks role, org_id, centre_id
        ↓
App calls a Supabase RPC/Edge Function:
  - Validates license: is the org's license_valid_until >= today?
  - If valid → returns KEY_B (the server half of the decryption key)
  - If expired → returns error: "License expired, contact administrator"
        ↓
App caches locally:
  - User session (auth token)
  - User profile (role, org_id, centre_id, name, class, board, medium)
  - KEY_B (the server decryption key half)
  - login_timestamp = now()
```

### 15-Day Sliding Window

```
Every time the app opens:
        ↓
Check: Is internet available?
        ↓
YES → Silently call backend:
  - Re-validate license (org's license_valid_until >= today?)
  - If valid → Reset login_timestamp to now(), refresh KEY_B cache
  - If expired → Do NOT reset timer. Let cached session expire naturally.
        ↓
NO → Check: Is (now - login_timestamp) < 15 days?
  - If yes → App works normally (offline mode)
  - If no  → Show "Please connect to internet and log in"
```

**Result:** A user who goes online at least once every 15 days never sees a login prompt. License revocation takes effect within max 15 days.

---

## Android TV App Architecture

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Kotlin |
| UI Framework | Jetpack Compose for TV |
| Video Player | ExoPlayer (Media3) with custom encrypted DataSource |
| Local Database | Room (SQLite) |
| Networking | Retrofit + Supabase REST API |
| DI | Hilt |
| USB Detection | BroadcastReceiver (ACTION_MEDIA_MOUNTED) |
| Encryption | javax.crypto (AES-256-CBC) |
| Build | Gradle + ProGuard/R8 for obfuscation |

### App Screens

1. **Splash Screen** — App logo, auto-checks cached session
2. **Login Screen** — Email + password, only shown when session expired
3. **Home Screen** — "Insert Pen Drive" prompt if no USB detected, or content library if USB mounted
4. **Content Library** — Browse by Class > Subject > Chapter (D-pad navigable)
5. **Video Player** — Full-screen ExoPlayer with progress tracking
6. **Quiz Screen** — Multiple choice questions, scoring, results
7. **Profile/Stats** — Videos completed, quiz scores, progress overview
8. **Settings** — Logout, about, sync status

### Key Components

```
com.edufleet.tv/
├── data/
│   ├── local/
│   │   ├── AppDatabase.kt          (Room DB)
│   │   ├── dao/
│   │   │   ├── VideoProgressDao.kt
│   │   │   ├── QuizAttemptDao.kt
│   │   │   └── SessionDao.kt
│   │   └── entity/
│   │       ├── CachedSession.kt
│   │       ├── VideoProgressEntity.kt
│   │       └── QuizAttemptEntity.kt
│   ├── remote/
│   │   ├── SupabaseApi.kt          (REST client)
│   │   └── SyncManager.kt          (analytics upload)
│   └── usb/
│       ├── UsbDriveDetector.kt     (BroadcastReceiver)
│       └── EncryptedContentReader.kt (AES decryption + manifest parsing)
├── domain/
│   ├── model/
│   │   ├── ContentItem.kt
│   │   ├── VideoItem.kt
│   │   └── QuizItem.kt
│   └── usecase/
│       ├── ValidateSessionUseCase.kt
│       ├── DecryptContentUseCase.kt
│       └── SyncAnalyticsUseCase.kt
├── player/
│   ├── EncryptedDataSource.kt      (ExoPlayer custom DataSource)
│   └── VideoPlayerViewModel.kt
├── ui/
│   ├── splash/
│   ├── login/
│   ├── home/
│   ├── library/
│   ├── player/
│   ├── quiz/
│   └── profile/
└── di/
    └── AppModule.kt                (Hilt dependency injection)
```

### USB Detection

```kotlin
// BroadcastReceiver registered in AndroidManifest.xml
class UsbDriveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_MEDIA_MOUNTED -> {
                val path = intent.data?.path
                // Check for .edufleet/ directory
                // Notify app that content is available
            }
            Intent.ACTION_MEDIA_REMOVED -> {
                // Content unavailable, return to "Insert Pen Drive" screen
            }
        }
    }
}
```

### Encrypted Video Playback

```kotlin
// Custom ExoPlayer DataSource that decrypts on-the-fly
class EncryptedDataSource(private val key: SecretKey) : DataSource {
    // Reads encrypted .dat file from USB
    // Decrypts chunks in memory using AES-256-CBC
    // Feeds decrypted stream to ExoPlayer
    // Video never exists decrypted on disk — only in memory during playback
}
```

---

## Analytics Tracking (Offline-First)

### What Gets Tracked Locally (Room DB)

Same metrics as the web LMS:

| Metric | Table | Fields |
|--------|-------|--------|
| Video progress | `video_progress` | video_id, watched_percentage, last_position, completed, last_watched_at |
| Quiz attempts | `quiz_attempts` | quiz_ref, total_questions, correct_answers, percent, mastery_level, started_at, completed_at |
| Quiz answers | `quiz_attempt_answers` | attempt_id, question_ref, selected_option, is_correct |
| App sessions | `app_sessions` | login_at, last_active_at, drive_id |

### Sync to Supabase

```
When internet is available (detected during session validation):
        ↓
SyncManager checks for unsynced records (synced = false)
        ↓
Batches them into API calls:
  - POST /rest/v1/video_progress (upsert by user_id + video_id)
  - POST /rest/v1/quiz_attempts
  - POST /rest/v1/quiz_attempt_answers
        ↓
On success → mark local records as synced
On failure → retry next time internet is available
```

**Important:** The video_id and quiz references on the pen drive must map to the same IDs used in the web LMS database. The manifest file should use the actual Supabase UUIDs for videos and chapters so analytics merge cleanly.

---

## Changes Required to Existing LMS & Supabase

### 1. NEW: License Validity on Organizations

**Migration: Add `license_valid_until` to `organizations` table**

```sql
ALTER TABLE organizations
ADD COLUMN license_valid_until DATE;

-- NULL means no expiry (backward compatible with existing orgs)
-- A date means the license expires at end of that day
```

**Impact:**
- Existing organizations continue working (NULL = no expiry)
- New orgs for the Android TV deal get an explicit end date
- The Android TV app checks this during login/refresh

### 2. NEW: License Validity on Centres

**Migration: Add `license_valid_until` to `centres` table**

```sql
ALTER TABLE centres
ADD COLUMN license_valid_until DATE;

-- NULL = inherits from organization's license_valid_until
-- A date = overrides the org-level setting for this specific centre
```

**Why centre-level too:** Different centres under the same NGO might have different contract terms.

### 3. NEW: License Validity on Profiles (Teachers & Students)

**Migration: Add `license_valid_until` to `profiles` table**

```sql
ALTER TABLE profiles
ADD COLUMN license_valid_until DATE;

-- NULL = inherits from centre (or org if centre is NULL)
-- A date = overrides for this specific user
```

**License resolution order:**
```
User's own license_valid_until
  → if NULL, check centre's license_valid_until
    → if NULL, check organization's license_valid_until
      → if NULL, no expiry (unlimited)
```

### 4. UPDATE: Organization Creation Form

**File:** `src/components/admin/create-org-form.tsx`

Add field:
- **License Valid Until** (date picker, optional)
- When left empty = no expiry

### 5. UPDATE: Centre Creation Form

**File:** `src/components/admin/create-centre-form.tsx`

Add field:
- **License Valid Until** (date picker, optional)
- Helper text: "Leave empty to inherit from organization"

### 6. UPDATE: User Creation Form

**File:** `src/components/admin/create-user-form.tsx`

Add field:
- **License Valid Until** (date picker, optional)
- Helper text: "Leave empty to inherit from centre/organization"

### 7. UPDATE: Admin Actions

**File:** `src/lib/actions/admin.ts`

- `createOrg()` — accept and save `license_valid_until`
- `createCentre()` — accept and save `license_valid_until`
- `createUser()` — accept and save `license_valid_until`

### 8. NEW: License Validation RPC

**Supabase Edge Function or Database Function:**

```sql
CREATE OR REPLACE FUNCTION validate_license(user_id UUID)
RETURNS JSON AS $$
DECLARE
  user_profile profiles%ROWTYPE;
  user_centre centres%ROWTYPE;
  user_org organizations%ROWTYPE;
  effective_expiry DATE;
BEGIN
  SELECT * INTO user_profile FROM profiles WHERE id = user_id;
  
  -- Resolve effective license expiry (user > centre > org)
  effective_expiry := user_profile.license_valid_until;
  
  IF effective_expiry IS NULL AND user_profile.centre_id IS NOT NULL THEN
    SELECT license_valid_until INTO effective_expiry FROM centres WHERE id = user_profile.centre_id;
  END IF;
  
  IF effective_expiry IS NULL AND user_profile.org_id IS NOT NULL THEN
    SELECT license_valid_until INTO effective_expiry FROM organizations WHERE id = user_profile.org_id;
  END IF;
  
  -- NULL = no expiry = always valid
  IF effective_expiry IS NULL OR effective_expiry >= CURRENT_DATE THEN
    RETURN json_build_object(
      'valid', true,
      'expires', effective_expiry,
      'content_key', current_setting('app.content_key_b')  -- KEY_B stored as DB config
    );
  ELSE
    RETURN json_build_object('valid', false, 'expires', effective_expiry);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 9. UPDATE: Web App Login Flow

**File:** `src/lib/actions/auth.ts`

After successful login, check license validity:
- If license expired → sign user out, show "Your license has expired. Contact your administrator."
- This applies to the web app too, not just Android TV

### 10. NEW: License Status in Admin Panels

**Org list page** (`src/app/(admin)/admin/orgs/page.tsx`):
- Show license expiry date
- Visual indicator: green (valid), yellow (expiring in <30 days), red (expired)

**Centre list page** (`src/app/(admin)/admin/centres/page.tsx`):
- Show effective license expiry (own or inherited from org)

**User list page** (`src/app/(admin)/admin/users/page.tsx`):
- Show effective license expiry
- Ability to bulk-extend licenses

### 11. NEW: `content_key_b` Storage

Store `KEY_B` securely in Supabase:
- Option A: Supabase Vault (encrypted secrets storage)
- Option B: Database config parameter (`app.content_key_b`)
- Option C: Environment variable in Edge Function

Recommendation: **Supabase Vault** — it's designed for this exact use case.

### 12. NEW: Android TV Sync Endpoint

Extend the existing `offline_sync_events` table or create a dedicated endpoint for Android TV analytics sync. The existing offline sync infrastructure can be reused since it already handles:
- Video progress upserts
- Quiz attempt recording
- Device identification (via `panel_fingerprint_hex` → reuse for TV device ID)

---

## Pen Drive Preparation Tool

A CLI tool (Node.js or Python) that the EduFleet team runs to prepare encrypted pen drives.

### What It Does

```
Input:  Raw video files + quiz JSON files + manifest config
Output: Encrypted pen drive ready for distribution
```

### Steps

1. Takes a directory of organized video files:
   ```
   raw_content/
   ├── Class 10/
   │   ├── Physics/
   │   │   ├── Chapter 1/
   │   │   │   ├── video1.mp4
   │   │   │   ├── video2.mp4
   │   │   │   └── quiz.json
   ```

2. Generates random filenames for each file
3. Encrypts each file with `AES-256-CBC(KEY_A + KEY_B)`
4. Generates the manifest (maps random names → real metadata)
5. Encrypts the manifest
6. Writes everything to the pen drive under `.edufleet/`
7. Optionally stamps a unique `drive_id` for tracking

### Command

```bash
edufleet-encrypt --source ./raw_content --target /Volumes/USB_DRIVE --key-a "xxx" --key-b "yyy"
```

---

## Testing Strategy

### What Can Be Tested on Emulator

| Component | Emulator? | How |
|-----------|-----------|-----|
| UI / Navigation (D-pad) | Yes | Android TV emulator in Android Studio |
| Login flow | Yes | Point to Supabase backend |
| Video playback | Yes | Push test encrypted files via `adb push` |
| Quiz engine | Yes | Push test quiz data via `adb push` |
| Analytics tracking | Yes | Verify Room DB entries |
| Session management (15-day) | Yes | Manipulate system clock |
| License validation | Yes | Test against live Supabase |

### What Requires Real Android TV

| Component | Why Real TV Needed |
|-----------|--------------------|
| USB pen drive detection | Emulator doesn't support physical USB mount events |
| USB mount/unmount events | BroadcastReceiver won't fire on emulator |
| Real playback performance | Ensure decryption doesn't cause lag on TV hardware |
| Remote control UX | Actual D-pad/remote feel |
| TV display quality | Verify UI at TV resolution (1080p/4K) |

### Testing Plan

1. **Phase 1 (Emulator):** Build and test UI, login, playback, quizzes, analytics — use `adb push` to simulate pen drive content
2. **Phase 2 (Real TV):** Sideload APK via `adb install`, test with actual encrypted pen drive, verify USB detection, validate performance
3. **Phase 3 (Integration):** End-to-end: login → pen drive → watch videos → take quiz → go online → verify analytics appear in web dashboard

### Sideloading APK to Real Android TV

```bash
# Connect TV to same WiFi network
# Enable Developer Options on TV (Settings > About > click Build Number 7 times)
# Enable ADB debugging

# Find TV's IP address (Settings > Network > Status)
adb connect <TV_IP>:5555

# Install APK
adb install edufleet-tv.apk

# Push test content (for development)
adb push test_content/ /sdcard/

# View logs
adb logcat | grep EduFleet
```

---

## Development Timeline

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| **1. Supabase Changes** | 2 days | License fields on org/centre/profile, validation RPC, KEY_B storage, web form updates |
| **2. Project Setup** | 1 day | Android TV project, Compose for TV scaffold, Hilt DI, Room DB |
| **3. Auth & License** | 2 days | Login screen, Supabase auth, session caching, 15-day sliding window, KEY_B fetch |
| **4. USB Detection** | 1 day | BroadcastReceiver, drive mount/unmount handling, `.edufleet/` directory detection |
| **5. Decryption Engine** | 2 days | AES-256 decryption, manifest parsing, content indexing |
| **6. Video Player** | 3 days | ExoPlayer + custom EncryptedDataSource, progress tracking, resume support |
| **7. Content Library UI** | 2 days | Class > Subject > Chapter browsing, D-pad navigation, search |
| **8. Quiz Engine** | 2 days | Quiz rendering, scoring, mastery levels, results screen |
| **9. Analytics & Sync** | 2 days | Room DB tracking, Supabase sync manager, conflict resolution |
| **10. Pen Drive Tool** | 1 day | CLI encryption tool for preparing pen drives |
| **11. TV Testing & Polish** | 3 days | Real device testing, performance tuning, edge cases |
| **Total** | **~3 weeks** | Complete working system |

---

## Open Questions / Decisions Needed

1. **Content scope:** All EduFleet classes (KG-12) on one pen drive, or separate pen drives per class range?
2. **Multiple users per TV:** Can different students log in on the same TV, or is it one user per TV?
3. **Drive ID tracking:** Do you want to track which pen drive went to which NGO/centre?
4. **Content updates:** When new videos are added, do NGOs get new pen drives, or is there an update mechanism?
5. **Branding:** Should the TV app match the EduFleet web app design, or have its own TV-optimized look?
6. **Hindi UI:** Does the TV app need English + Hindi UI toggle like the web app?
7. **KEY_B rotation policy:** How often (if ever) should KEY_B be rotated?
8. **Bandwidth for video:** Videos are typically large files — what's the total content size? This affects pen drive capacity (32GB? 64GB? 128GB?).
