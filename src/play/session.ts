import type { EngineSnapshot, EngineStatus } from "../audio/MixEngine";

const KEY = "voicestream_play_session";

export type PlaySessionSave = {
  path: string;
  status: Exclude<EngineStatus, "idle">;
  sessionSec: number;
};

export function writePlaySession(path: string, snap: EngineSnapshot): void {
  if (!path.startsWith("/play") || snap.status === "idle") {
    sessionStorage.removeItem(KEY);
    return;
  }
  const payload: PlaySessionSave = {
    path,
    status: snap.status,
    sessionSec: snap.sessionSec,
  };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function readPlaySession(): PlaySessionSave | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PlaySessionSave;
    if (!v?.path || (v.status !== "playing" && v.status !== "paused")) return null;
    if (!Number.isFinite(v.sessionSec) || v.sessionSec < 0) v.sessionSec = 0;
    return v;
  } catch {
    return null;
  }
}

export function isReloadNavigation(): boolean {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === "reload") return true;
  const legacy = (performance as Performance & { navigation?: { type?: number } }).navigation;
  return legacy?.type === 1;
}
