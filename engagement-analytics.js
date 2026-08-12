(() => {
  "use strict";

  const OFFICIAL_HOST = "assmagic2026.github.io";
  const MIN_SECONDS = 3;
  const MAX_SECONDS = 12 * 60 * 60;
  const script = document.currentScript;
  const endpoint = script?.dataset?.endpoint;

  if (window.location.hostname !== OFFICIAL_HOST || !endpoint) return;
  if (typeof window.performance?.now !== "function") return;

  const createSessionId = () => {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  };

  const sessionId = createSessionId();
  let accumulatedVisibleMs = 0;
  let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
  let lastSentSeconds = 0;

  const stopVisibleClock = () => {
    if (visibleSince === null) return;
    accumulatedVisibleMs += Math.max(0, performance.now() - visibleSince);
    visibleSince = null;
  };

  const startVisibleClock = () => {
    if (visibleSince === null) visibleSince = performance.now();
  };

  const currentVisibleSeconds = () => {
    const activeMs = visibleSince === null
      ? 0
      : Math.max(0, performance.now() - visibleSince);
    return Math.min(MAX_SECONDS, Math.floor((accumulatedVisibleMs + activeMs) / 1000));
  };

  const sendSnapshot = () => {
    const seconds = currentVisibleSeconds();
    if (seconds < MIN_SECONDS || seconds <= lastSentSeconds) return;

    const body = JSON.stringify({ v: 1, sessionId, seconds });
    let queued = false;

    try {
      queued = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(endpoint, body);
    } catch (error) {
      queued = false;
    }

    if (!queued) {
      try {
        void fetch(endpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          keepalive: true,
          headers: { "content-type": "text/plain;charset=UTF-8" },
          body,
        }).catch(() => {});
      } catch (error) {
        // Analytics must never interfere with the experience.
      }
    }

    lastSentSeconds = seconds;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopVisibleClock();
      sendSnapshot();
    } else {
      startVisibleClock();
    }
  }, { passive: true });

  window.addEventListener("pagehide", () => {
    stopVisibleClock();
    sendSnapshot();
  }, { passive: true });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && document.visibilityState === "visible") startVisibleClock();
  }, { passive: true });
})();
