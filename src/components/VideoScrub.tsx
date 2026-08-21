"use client";

import { useEffect, useRef } from "react";

// Scrubs through the clip frame-by-frame based on horizontal position across
// the *whole page* (not just this strip): leftmost = frame 0, rightmost =
// last frame — cursor on desktop, touch drag on mobile. No playback, just a
// hover scrubber.
export default function VideoScrub() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // iOS Safari won't decode/paint a single frame of a <video> until it has
    // actually played — `preload="auto"` alone leaves it blank. Autoplay
    // (muted + playsInline, both required for iOS to allow it) then pause
    // right away once a frame lands, so it reads as static but scrubbable.
    const pauseOnceStarted = () => video.pause();
    video.addEventListener("playing", pauseOnceStarted);
    video.play().catch(() => {});

    return () => video.removeEventListener("playing", pauseOnceStarted);
  }, []);

  useEffect(() => {
    const scrubToFraction = (fraction: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.min(1, Math.max(0, fraction)) * video.duration;
    };

    const scrubToClientX = (clientX: number) => {
      scrubToFraction(clientX / document.documentElement.clientWidth);
    };

    const onMouseMove = (e: MouseEvent) => scrubToClientX(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) scrubToClientX(touch.clientX);
    };

    window.addEventListener("mousemove", onMouseMove);
    // Capture phase: the map (Leaflet) calls stopPropagation() on touch
    // drags for its own panning, which would otherwise swallow this before
    // it reaches a bubble-phase listener — and panning the map is exactly
    // when this should keep scrubbing.
    window.addEventListener("touchmove", onTouchMove, { capture: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, []);

  return (
    <div className="video-scrub">
      <video
        ref={videoRef}
        className="video-scrub-el"
        src="/pies.mp4"
        muted
        playsInline
        autoPlay
        preload="auto"
      />
    </div>
  );
}
