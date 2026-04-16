# Video Hardening Plan

## Current state

The app now uses an authenticated internal playback flow for video files:

- clients request a short-lived playback session from `/api/media/session`
- the browser receives an app-issued playback URL instead of a raw S3 URL
- `/api/media/video/[id]` validates the current user session plus a signed playback token
- the app streams the S3 object itself and no longer hands out raw video presigned URLs
- learner playback shows a visible user watermark to discourage screen-recording leaks
- admin previews use the same secure playback path
- `/api/presign` rejects direct access to video file types

This is not true DRM, but it is materially stronger than raw presigned MP4 delivery.

## Stronger free next step

The closest free option to DRM is encrypted HLS with app-controlled key delivery.

Recommended target design:

1. Package each lesson into HLS under a private S3 prefix such as `hls/<video-id>/<variant>/`.
2. Encrypt segments with AES-128 or SAMPLE-AES during packaging.
3. Serve manifests from the app, not directly from S3.
4. Serve the encryption key from an authenticated route with the same short-lived token model.
5. Use `hls.js` in the browser for non-Safari playback and native HLS on Safari.
6. Keep the learner watermark on top of the player.

## Suggested S3 layout

```text
hls/
  <video-id>/
    default/
      playlist.m3u8
      segment_000.ts
      segment_001.ts
      enc.key
    hindi/
      playlist.m3u8
      segment_000.ts
      segment_001.ts
      enc.key
```

The key file should not be public. In the stronger version, it should be served by an API route and omitted from public bucket access.

## Packaging blueprint

Example local packaging flow with `ffmpeg`:

```bash
ffmpeg \
  -i input.mp4 \
  -c:v libx264 \
  -c:a aac \
  -preset veryfast \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_key_info_file keyinfo.txt \
  -hls_segment_filename 'segment_%03d.ts' \
  playlist.m3u8
```

Where `keyinfo.txt` contains:

```text
https://your-app.example.com/api/media/hls/key?videoId=<video-id>&variant=<variant>&token=<signed-token>
/absolute/path/to/local/enc.key
/absolute/path/to/local/enc.key.iv
```

## Runtime plan for encrypted HLS

New routes to add next:

- `/api/media/hls/session?videoId=...&variant=...`
- `/api/media/hls/manifest/[id]`
- `/api/media/hls/segment/[id]`
- `/api/media/hls/key`

The flow should be:

1. frontend requests HLS session
2. app verifies course access and issues short-lived token
3. player loads manifest from app route
4. manifest references app-controlled segment and key routes
5. app validates token on every manifest, segment, and key request

## Why this is closer to DRM

- the browser no longer receives a single downloadable MP4 URL
- users need many authenticated requests to reconstruct a stream
- the encryption key can be gated separately from the media segments
- token expiry and user-bound URLs make sharing less useful

This still does not stop screen recording, so it remains weaker than Widevine/FairPlay/PlayReady, but it is the strongest free path available in this stack.
