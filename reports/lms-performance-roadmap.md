# LMS Performance Roadmap

## Objective

Make the EduFleet LMS feel fast on every page, even when user-specific data must come from Supabase.

The goal is not only lower backend latency, but better perceived speed:

- pages should render a stable shell immediately
- the first meaningful section should appear quickly
- repeated navigation between learner pages should feel nearly instant
- admin analytics should stop rebuilding large datasets on every request

## Current Baselines

The exact runtime baselines still need to be measured with request timings and query counts. Today this document is grounded in code-path inspection, not yet in `Server-Timing` captures.

That means the performance targets below should be treated as goals, while the first implementation step should also add measurement for:

- total server duration
- Supabase query count
- row counts returned per page
- largest in-memory collections per page

## What Is Slow Today

Based on the current codebase:

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/subjects/page.tsx`
- `src/app/(dashboard)/dashboard/progress/page.tsx`
- `src/lib/quiz-hub.ts`
- `src/app/(dashboard)/dashboard/quizzes/page.tsx`
- `src/app/(dashboard)/dashboard/quizzes/[subjectId]/page.tsx`
- `src/lib/analytics/server.ts`

the main cost is not just raw DB latency. The larger issue is repeated full-scope rebuilding:

1. load profile
2. load all chapters in scope
3. load org restrictions
4. load all videos for those chapters
5. load all user progress rows for those videos
6. rebuild subject, chapter, dashboard, or quiz summaries in JavaScript

This same pattern appears on multiple learner pages.

There are also three specific amplifiers:

- a query waterfall on learner pages, where some independent reads could run in parallel after profile scope is known
- a dual quiz data path, where some pages combine DB-backed quizzes with fallback MCQ quiz metadata and attempts
- analytics aggregation in `src/lib/analytics/server.ts`, which currently scales by pulling large raw datasets into Node.js

## Core Principles

### 1. Separate static-ish catalog data from user-specific progress

Catalog-like data changes rarely:

- subjects
- chapters
- video counts
- quiz availability
- org restrictions

User-specific data changes often:

- watch progress
- quiz attempts
- continue watching state
- recent activity

These two categories should not be recomputed together on every page request.

### 2. Build one shared learner scope manifest

Create one reusable loader for:

- `class`
- `board`
- `medium`
- `org_id`

and return:

- allowed subjects
- allowed chapters
- video counts by chapter
- quiz availability by chapter

This should become the common foundation for:

- dashboard
- subjects
- progress
- quiz hub
- quiz subject page

### 3. Push aggregation into the database

Today, many pages fetch rows and reduce them in JS.

Instead, use:

- SQL views
- RPCs
- grouped selects
- summary tables for analytics

The database is better at:

- counts
- sums
- grouping
- ordering
- filtering large sets

### 4. Cache short-lived reads aggressively

Most learner read pages do not need millisecond-level freshness.

Good candidates for short-lived caching:

- dashboard summary
- subjects summary
- progress summary
- quiz hub summary
- quiz subject chapter list

Freshness target can be:

- `15-60s` for learner summaries
- `30-300s` for admin analytics summaries

### 5. Make the UI stream and skeleton well

Even when data takes time, the user should never stare at a blank page.

Use:

- route-level loading states
- section-level skeletons
- streaming of heavy sections
- optimistic transitions after quiz submit or progress save

## Performance Targets

These are good practical targets for the current LMS:

- dashboard initial server response: `< 300ms` on warm paths
- main learner summary visible: `< 800ms`
- subject pages and quiz hub: `< 700ms`
- chapter watch page shell: `< 500ms`
- quiz page shell: `< 500ms`
- admin analytics summary shell: `< 1.2s`
- heavy analytics drilldowns: streamed, not blocking the page shell

## Phase 1: Quick Wins

These changes should give the biggest visible improvement with low architectural risk.

### A. Stop rebuilding video lookups repeatedly

Current pages repeatedly do patterns like:

- `videos.filter(video => video.chapter_id === chapter.id)`
- `chapters.filter(...)`

inside loops.

Replace with precomputed maps:

- `videosByChapterId`
- `progressByVideoId`
- `chapterStatsById`
- `quizzesByChapterId`
- `bestAttemptByQuizId`

This cuts a lot of unnecessary CPU work on the server.

Pages to fix first:

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/subjects/page.tsx`
- `src/app/(dashboard)/dashboard/progress/page.tsx`
- `src/lib/quiz-hub.ts`

### B. Introduce one shared scope loader

Add a shared helper such as:

- `src/lib/learner-scope.ts`

Possible API:

```ts
getLearnerScopeManifest({
  userId,
  includeVideos?: boolean,
  includeQuizAvailability?: boolean,
});
```

This should centrally resolve:

- profile scope
- allowed chapter ids
- restrictions
- video counts
- subject grouping

It should also make the remaining query waterfall explicit so that independent reads can be parallelized with `Promise.all` where safe.

Pages should reuse this instead of re-querying the same base data independently.

### C. Add short-lived caching to read pages

Right now quiz pages explicitly use:

- `force-dynamic`
- `noStore()`

Use uncached reads only where truly necessary.

Recommended split:

- cache scope manifest and quiz catalog pieces
- keep attempt history dynamic where needed

For example:

- quiz hub summary can be cached for `30s`
- subject quiz page catalog can be cached for `30s`
- attempt counts and latest scores can be fetched dynamically in a smaller query

### D. Add `loading.tsx` for heavy routes

If not already present, add route loading UIs for:

- `/dashboard`
- `/dashboard/progress`
- `/dashboard/quizzes`
- `/dashboard/quizzes/[subjectId]`
- `/admin/analytics`

Even if real speed does not improve immediately, perceived speed will improve a lot.

### E. Prefetch internal navigation aggressively

Since the app is path-driven and learner flows are predictable, make sure:

- subject cards prefetch subject pages
- chapter links prefetch quiz and watch pages where sensible
- quiz hub links prefetch subject detail pages

### F. Fix the worst wasted-work page first

The current quiz subject page is an especially bad offender:

- `src/app/(dashboard)/dashboard/quizzes/[subjectId]/page.tsx`

It previously loaded full-scope quiz hub data for all subjects and then selected one subject. That means one subject page paid the cost of all subject summaries, chapter cards, video progress, and attempt history.

This page should stay on the critical path for optimization until it only loads the selected subject plus lightweight subject-link metadata.

## Phase 2: Database-Side Optimization

### A. Add the right indexes

Recommended index work:

```sql
create index if not exists idx_chapters_scope
on chapters (class, board, medium, subject_id, chapter_no);

create index if not exists idx_chapter_quizzes_chapter_published
on chapter_quizzes (chapter_id, is_published);

create index if not exists idx_quiz_attempts_user_quiz_completed
on quiz_attempts (user_id, quiz_id, completed_at desc);
```

Notes:

- `videos (chapter_id, sort_order)` already exists
- `video_progress (user_id, last_watched_at desc)` already exists
- `video_progress (user_id, video_id)` is already covered by the `unique_user_video` unique constraint
- `content_restrictions (org_id, chapter_id)` is already covered by the `unique_org_chapter` unique constraint
- `idx_chapters_scope` is still useful because it widens the existing `(class, board, medium)` index to match common learner-page filtering and ordering
- `idx_chapter_quizzes_chapter_published` should be verified against production before adding, but it is the most likely missing quiz-side composite index

### B. Create RPCs for learner pages

Good candidates:

- `rpc_learner_dashboard_summary`
- `rpc_learner_subject_progress`
- `rpc_learner_progress_summary`
- `rpc_learner_quiz_hub_summary`
- `rpc_learner_quiz_subject_cards`

Each RPC should return already-grouped data instead of raw rows.

Example:

`rpc_learner_quiz_hub_summary(user_id uuid)` should return:

- subject id
- subject name
- total quizzes
- started chapters
- total quiz runs
- average best score
- mastered count
- lesson completion totals

That would replace a lot of server-side assembly currently happening in `src/lib/quiz-hub.ts`.

### C. Move admin analytics toward snapshots

`src/lib/analytics/server.ts` is doing a lot of heavy dynamic work.

For analytics, the right long-term approach is:

- snapshot tables
- periodic aggregation jobs
- small filtered reads from summary tables

Recommended snapshot grain:

- org x date
- centre x date
- class x subject x date
- chapter x date

Metrics to precompute:

- students in scope
- active students
- completed chapters
- average watch percentage
- drop-off candidates
- never-logged-in count

## Phase 3: Page-by-Page Plan

### Dashboard

Current problem:

- too much row loading and JS reduction

Plan:

- use cached scope manifest
- fetch continue-watching in one targeted query
- fetch recommended next lessons in one targeted query
- fetch subject totals via grouped query or RPC

### Subjects

Current problem:

- repeats scope build and progress assembly

Plan:

- reuse cached subject summary from the dashboard layer
- render directly from aggregated subject rows

### Progress

Current problem:

- one of the heaviest learner pages
- combines chapter/video summary and quiz summary in one path
- also combines DB quiz reads with fallback quiz metadata and fallback attempt history

Plan:

- split overall summary from per-subject detail
- stream per-subject sections after shell render
- use RPC for chapter completion and quiz mastery summary

### Quiz Hub

Current problem:

- still computes all subject summary data on demand

Plan:

- cache subject summary for short TTL
- fetch only lightweight subject card data on hub
- move chapter card loading to the subject page only

### Quiz Subject Page

Current problem:

- historically depended on full quiz hub data helper and paid the cost of loading all subject summaries to render one subject

Plan:

- fetch only one subject's chapter quiz cards
- use subject-specific RPC or grouped query
- no need to compute all other subject stats on this page

### Watch Page

Current problem:

- watch page still loads chapter context, sibling lesson list, progress, quiz status

Plan:

- keep video shell immediate
- stream secondary panel data
- lazy load or defer quiz CTA metadata if needed

### Admin Analytics

Current problem:

- expensive reads and in-memory shaping
- currently vulnerable to scale pain because large progress sets are pulled into Node.js and reduced there instead of grouped in SQL or snapshots

Plan:

- summary tables
- filtered snapshot queries
- render shell first, stream heavy comparison charts second

## Phase 4: Perceived Speed Upgrades

These are UX improvements that make the LMS feel much faster even before the backend is perfect.

### A. Persistent app shell

Keep sidebar, top bar, and page scaffolding instant.

### B. Section skeletons instead of blank pages

Especially for:

- quiz hub cards
- subject progress sections
- analytics cards
- chapter lists

### C. Optimistic updates

Examples:

- after quiz submit, update local score summary immediately
- after progress save, update continue-watching card locally

### D. Smarter image and preview loading

For content-heavy pages:

- only load visible thumbnails
- lazy-load chapter previews
- avoid generating expensive media previews during page render

## Scale Readiness (50k users)

This section covers what the phase work above does not: the operational questions that only become visible at scale.

### A. Load model

Plan capacity against peak, not registered total.

- registered users: `50,000`
- assumed peak concurrency: `2-5%` of registered during exam prep and evening study windows
- target concurrent active users for load tests: `1,000-2,500`
- burst scenarios to model:
  - synchronized class start (same org, same time)
  - quiz deadline window
  - live lesson end, when many learners resume watch at once

Gate release on:

- p95 server latency per route
- DB CPU under sustained peak
- row-read volume per request
- error rate and timeout rate

### B. RLS audit for learner reads

Analytics bypasses RLS through the admin client in `src/lib/analytics/server.ts`, but learner pages go through RLS on every read.

At 50k users, RLS policy function cost per row is material. Audit:

- policies on `video_progress`, `quiz_attempts`, `chapters`, `videos`, `content_restrictions`, `profiles`
- any policy that re-queries another table (subselect policies are the common offender)
- whether policy functions are `stable` / `immutable` where possible so the planner can cache them
- whether admin-like reads on learner pages could use a narrower service path instead of broad RLS evaluation

### C. Write-path load

Read-path optimization is only half the problem. The big write sources at 50k scale:

- `video_progress` upserts on watch ticks, through `src/lib/actions/progress.ts`
- `quiz_attempts` and related rows, through `src/lib/actions/quiz.ts`

Load tests must cover write traffic, not only page loads. Mitigations to consider before peak:

- debounce or batch progress ticks on the client
- coalesce upserts server-side where safe
- ensure `video_progress` write indexes are not over-indexed (every extra index slows each upsert)

### D. Snapshot refresh strategy

The phase work recommends snapshot / summary tables for admin analytics. Before building, decide:

- refresh cadence per snapshot grain (org x date, centre x date, class x subject x date, chapter x date)
- refresh mechanism: cron job, scheduled RPC, or incremental trigger-based updates
- acceptable staleness per surface (admin overview vs teacher dashboard vs learner progress)
- backfill plan for historical data on first rollout

Staleness target should be explicit, for example:

- admin overview counters: up to `5 min` stale
- org / centre analytics: up to `15 min` stale
- class / chapter drilldowns: up to `1 hour` stale, acceptable for trend views

### E. Rollout and rollback

RPC and snapshot cutovers are the riskiest changes in this roadmap. Gate each one:

- feature flag per RPC so the old assembly path stays available
- shadow-read new RPC alongside old path and diff results in logs before switching traffic
- per-route toggle so a bad RPC on one page does not require a full revert
- keep the old JS-assembly code in place for at least one release after cutover

Same pattern for admin analytics snapshots: the old live-aggregation path should remain callable until snapshot accuracy is verified against it.

## Instrumentation Plan

Before and during implementation, measure real server time.

Recommended:

- add timing logs around:
  - profile fetch
  - scope fetch
  - videos fetch
  - progress fetch
  - quiz fetch
  - analytics summary build
- optionally add `Server-Timing` headers on key routes
- capture:
  - total server duration
  - DB query duration
  - row counts returned
- audit RLS-heavy tables and policies to see whether policy functions are adding avoidable latency on every read

This matters because otherwise it is easy to optimize the wrong thing.

## Recommended Delivery Order

### Sprint 1

- add measurement and `Server-Timing`
- build `learner-scope` helper
- parallelize obvious post-profile reads with `Promise.all`
- optimize quiz subject page
- replace repeated array filtering with maps
- optimize dashboard
- optimize subjects

### Sprint 2

- optimize quiz hub
- optimize progress shell + streamed detail sections
- verify and add only the genuinely missing indexes

### Sprint 3

- add indexes
- add learner RPCs
- remove unnecessary `noStore` / `force-dynamic`

### Sprint 4

- analytics snapshots
- admin analytics migration to summary tables

## Concrete First Tasks

If starting implementation immediately, do these first:

1. Add `src/lib/learner-scope.ts`
2. Refactor `dashboard/page.tsx` to use maps instead of nested filters
3. Refactor `subjects/page.tsx` to reuse shared scope summary
4. Refactor `quiz-hub.ts` so the hub and subject page do not both compute the full subject graph
5. Add `Server-Timing` and timing logs on learner routes
6. Add only the missing or widened DB indexes listed above
7. Add `loading.tsx` for learner dashboard, progress, quiz hub, quiz subject page

## Expected Outcome

If the above is implemented well:

- learner pages should feel dramatically faster
- navigation between subjects, quizzes, and progress should feel near-instant after warm cache
- admin analytics will stop feeling heavy and fragile
- the codebase will become easier to maintain because scope logic stops being duplicated everywhere
