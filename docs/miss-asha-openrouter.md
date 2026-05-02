# Miss Asha OpenRouter Setup

Miss Asha uses OpenRouter from the server-side chat route.

Required local environment variables:

```bash
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=google/gemini-2.5-flash
# Optional, only for future OpenRouter transcript jobs:
# OPENROUTER_TRANSCRIPT_MODEL=google/gemini-2.5-flash
```

The raw API key should stay in `.env.local` or the deployment secret store, not in this Markdown file.

## Transcript Pipeline

Miss Asha reads lesson transcript knowledge from `public.ai_video_notes`.

Generate one transcript locally:

```bash
npm run transcribe:asha -- --video-id <video_uuid> --provider local
```

Generate a small class batch:

```bash
npm run transcribe:asha -- --class 12 --limit 10 --provider local
```

Generate both English and Hindi variants where both S3 keys exist:

```bash
npm run transcribe:asha -- --class 12 --limit 10 --variant both --provider local
```

The completed English video context for classes 6, 9, 11, and 12 is stored in this table for retrieval by the chat route.

`OPENROUTER_MODEL` powers Miss Asha's student chat. The production tutor currently uses `google/gemini-2.5-flash`.

Run the live tutor smoke test:

```bash
npm run test:asha-live
```
