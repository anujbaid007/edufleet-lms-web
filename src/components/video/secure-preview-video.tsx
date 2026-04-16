"use client";

import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import type Hls from "hls.js";
import type { SecurePlaybackSession } from "@/lib/secure-video-client";

type SecurePreviewVideoProps = {
  className?: string;
  playback: SecurePlaybackSession;
  style?: CSSProperties;
};

export function SecurePreviewVideo({ className, playback, style }: SecurePreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentVideo = video;
    const currentPlayback = playback;

    let cancelled = false;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    currentVideo.pause();
    currentVideo.removeAttribute("src");
    currentVideo.load();

    if (currentPlayback.delivery === "mp4") {
      currentVideo.src = currentPlayback.url;
      return () => {
        currentVideo.pause();
        currentVideo.removeAttribute("src");
        currentVideo.load();
      };
    }

    async function attachHls() {
      if (currentVideo.canPlayType("application/vnd.apple.mpegurl")) {
        currentVideo.src = currentPlayback.url;
        return;
      }

      const hlsModule = await import("hls.js");
      if (cancelled) return;

      const HlsClass = hlsModule.default;
      if (!HlsClass.isSupported()) return;

      const hls = new HlsClass({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(currentPlayback.url);
      hls.attachMedia(currentVideo);
    }

    void attachHls();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      currentVideo.pause();
      currentVideo.removeAttribute("src");
      currentVideo.load();
    };
  }, [playback]);

  const blockContextMenu = (event: MouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
  };

  return (
    <video
      ref={videoRef}
      key={playback.url}
      src={playback.delivery === "mp4" ? playback.url : undefined}
      controls
      autoPlay
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      onContextMenu={blockContextMenu}
      className={className}
      style={style}
    />
  );
}
