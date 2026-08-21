"use client";

import { useEffect, useRef } from "react";

// iOS 13+ gates the tilt sensor behind an explicit permission prompt that
// must be triggered from a user gesture.
type RequestableDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// How far (in degrees) from flat counts as "all the way" left/right.
const TILT_RANGE_DEG = 45;

// Scrubs through the clip frame-by-frame based on horizontal position:
// leftmost = frame 0, rightmost = last frame. On desktop that's the cursor
// across the *whole page* (not just this strip); on mobile — no cursor to
// track — it's the phone's left/right tilt instead. No playback, just a hover
// scrubber.
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
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      scrubToFraction((e.gamma + TILT_RANGE_DEG) / (TILT_RANGE_DEG * 2));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("deviceorientation", onOrientation);

    const orientationEvent = window.DeviceOrientationEvent as
      | RequestableDeviceOrientationEvent
      | undefined;
    let requestOnce: (() => void) | null = null;
    if (typeof orientationEvent?.requestPermission === "function") {
      requestOnce = () => {
        orientationEvent.requestPermission?.().catch(() => {});
      };
      // Capture phase: the map (Leaflet) calls stopPropagation() on its own
      // touchstart handling, which would otherwise swallow this before it
      // ever reaches a bubble-phase listener on document.
      document.addEventListener("touchstart", requestOnce, { once: true, capture: true });
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("deviceorientation", onOrientation);
      if (requestOnce) document.removeEventListener("touchstart", requestOnce, { capture: true });
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
