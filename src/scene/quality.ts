/**
 * Adaptive quality (plan 007 C). Everything here is pure: the device tier, the dpr ladder, the FPS
 * meter's ring buffer and the stage transition. `QualityController.tsx` wires them to the frame loop.
 *
 * Two axes (plan 008 R3). Resolution and geometry (stages 0-4: dpr and instance counts) never
 * recompile a shader and go both ways. Post-processing (`post`: N8AO off, Bloom off, composer off)
 * rebuilds passes, so it may stall once; it only goes down, never back up in the session. A slow
 * device drops N8AO first, then stages 0-4, then Bloom, then the composer. Shadows are fixed by the
 * tier at start.
 */

export type Tier = 'desktop' | 'mobile';

export interface TierInput {
  /** `matchMedia('(pointer: coarse)').matches` */
  coarsePointer: boolean;
  width: number;
  height: number;
}

/** A touch device or a short side under 500px is `mobile`. Decided once at start. */
export function detectTier({ coarsePointer, width, height }: TierInput): Tier {
  return coarsePointer || Math.min(width, height) < 500 ? 'mobile' : 'desktop';
}

/** Shadow map size per tier; never changed at runtime (a new render target recompiles). */
export const SHADOW_MAP_SIZE: Record<Tier, number> = { desktop: 2048, mobile: 1024 };

/** Stage 0 dpr per tier; stages 1 and 2 are fixed. Stages 3 and 4 keep stage 2's dpr. */
const TOP_DPR: Record<Tier, number> = { desktop: 2, mobile: 1.5 };
const STEP_DPR = [1.25, 1] as const;
export const LAST_STAGE = 4;

/** Post-processing axis (008 R3): everything on, N8AO off, Bloom off, no composer (plain). */
export const POST_FULL = 0;
export const POST_NO_AO = 1;
export const POST_NO_BLOOM = 2;
export const POST_OFF = 3;

export interface Ladder {
  /** Stages in use, top (0) first. A dpr stage equal to the one before it is left out. */
  readonly stages: readonly number[];
  /** dpr per stage number (index = stage, all five filled). */
  readonly dpr: readonly number[];
}

/** The device's own pixel ratio from `window`, 1 when it is missing or not a positive number. */
export function sanitizeDpr(dpr: number | undefined): number {
  return dpr !== undefined && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

/** dpr never goes above the device's own ratio (no oversampling). */
export function buildLadder(tier: Tier, deviceDpr: number): Ladder {
  const cap = sanitizeDpr(deviceDpr);
  const d0 = Math.min(TOP_DPR[tier], cap);
  const d1 = Math.min(STEP_DPR[0], cap);
  const d2 = Math.min(STEP_DPR[1], cap);
  const dpr = [d0, d1, d2, d2, d2];
  const stages = [0];
  if (d1 !== d0) stages.push(1);
  if (d2 !== d1) stages.push(2);
  stages.push(3, 4);
  return { stages, dpr };
}

/** What the scene reads for a stage. M4-3 reads the last two for the asteroid belt and outer rocks. */
export interface QualityLevel {
  stage: number;
  dpr: number;
  /** Share of the asteroid belt's instances drawn: 1, or 0.5 from stage 3. */
  asteroidFraction: number;
  /** The outer ring's rock cells draw nothing at stage 4. */
  outerRocksVisible: boolean;
}

export function levelOf(ladder: Ladder, stage: number): QualityLevel {
  return {
    stage,
    dpr: ladder.dpr[Math.min(stage, LAST_STAGE)] ?? 1,
    asteroidFraction: stage >= 3 ? 0.5 : 1,
    outerRocksVisible: stage < 4,
  };
}

// --- FPS meter -----------------------------------------------------------------------------

/** Room for 2 s at 240 Hz. */
const METER_CAPACITY = 512;
/** A single gap longer than this is a stall (tab switch, debugger), not a frame. */
const MAX_DELTA = 1;

/** Frame deltas (seconds) in a preallocated ring buffer. `push` never allocates. */
export class FpsMeter {
  private readonly deltas = new Float64Array(METER_CAPACITY);
  private head = 0;
  private count = 0;
  /** Over-long gaps in a row. */
  private stalls = 0;

  push(delta: number): void {
    if (!(delta > 0)) return;
    if (delta > MAX_DELTA) {
      // One long gap is a stall and is dropped. Gaps that keep coming are the real frame rate
      // (under 1 fps): keep their true length so the average moves, the stage can drop, and a drop
      // that helps (2.5 s -> 1.25 s frames) shows as a gain instead of a flat 1 fps.
      this.stalls += 1;
      if (this.stalls < 2) return;
    } else {
      this.stalls = 0;
    }
    this.deltas[this.head] = delta;
    this.head = (this.head + 1) % METER_CAPACITY;
    if (this.count < METER_CAPACITY) this.count += 1;
  }

  /** Mean FPS over the most recent `windowSec` of frames; null with no frames. */
  average(windowSec: number): number | null {
    let sum = 0;
    let n = 0;
    let i = this.head;
    // The epsilon keeps float drift from pulling in one frame older than the window.
    while (n < this.count && sum < windowSec - 1e-9) {
      i = (i - 1 + METER_CAPACITY) % METER_CAPACITY;
      sum += this.deltas[i] ?? 0;
      n += 1;
    }
    return n === 0 ? null : n / sum;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.stalls = 0;
  }
}

// --- Stage transition ----------------------------------------------------------------------

export interface Thresholds {
  /** Below this for `DOWN_HOLD_MS`: one stage down. */
  down: number;
  /** Above this for `UP_HOLD_MS`: one stage up. */
  up: number;
}

export const THRESHOLDS: Record<Tier, Thresholds> = {
  desktop: { down: 50, up: 58 },
  mobile: { down: 27, up: 45 },
};

export const SAMPLE_MS = 500;
export const WINDOW_SEC = 2;
export const DOWN_HOLD_MS = 2000;
export const UP_HOLD_MS = 6000;
export const COOLDOWN_MS = 3000;
export const WARMUP_MS = 5000;
export const RESUME_IGNORE_MS = 2000;
/**
 * Return-threshold deadlock: after a drop the FPS can settle just under `up` (a 57 fps desktop),
 * so the threshold alone would never bring quality back. If the FPS has stayed at or above the
 * midpoint of `down` and `up` this long, try one stage up anyway.
 */
export const PROBE_MS = 20000;
/** A drop this soon after an up means that up failed. */
export const FAIL_WINDOW_MS = 10000;
/**
 * After a failed up, no up for this long; doubles with each failure (only the `?perf` toggle resets
 * it), so changes get rarer instead of oscillating.
 */
export const BACKOFF_START_MS = 30000;
export const BACKOFF_MAX_MS = 480000;
/**
 * Frame-capped devices (a 30 Hz low-power Safari): dropping a stage cannot raise the FPS. If the
 * mean once the cooldown ends is not at least this much above the mean at the drop, the drop is
 * undone and no drop goes below that stage until the FPS clears `up` (the cap is gone) or falls
 * to `FLOOR_LOSS` of the FPS at the undo for `DOWN_HOLD_MS` (something else got slower: dropping
 * is tried again, and checked again).
 */
export const DROP_GAIN = 1.1;
export const FLOOR_LOSS = 0.85;

export interface QualityState {
  stage: number;
  /** Post-processing axis, `POST_FULL`..`POST_OFF`; only ever goes up. */
  post: number;
  hidden: boolean;
  /** Samples before this are dropped (warmup at start, 2 s after the tab shows again). */
  ignoreUntil: number;
  lastChangeAt: number;
  belowSince: number | null;
  aboveSince: number | null;
  /** Since when every sample was at or above the probe level (null: one was not). */
  calmSince: number | null;
  lastUpAt: number;
  upBlockedUntil: number;
  backoffMs: number;
  /** The last drop, until its effect is checked: the stage it left and the FPS then. */
  dropCheck: { from: number; fps: number } | null;
  /** No drop from this stage or below (null: none), and the FPS when it was set. */
  floor: { stage: number; fps: number } | null;
  /** Since when the FPS has been under `FLOOR_LOSS` of the floor's FPS. */
  degradedSince: number | null;
}

export type QualityEvent =
  /** `forced`: the `?perf` toggle's FPS, not a measurement; a drop's effect is not checked. */
  | { type: 'sample'; t: number; fps: number; forced?: boolean }
  | { type: 'hidden'; t: number }
  | { type: 'visible'; t: number }
  /** The `?perf` toggle changed: what happened before says nothing about the real FPS. */
  | { type: 'override'; t: number }
  /** Post-processing went down from outside (the composer failed: plain). Never lowers `post`. */
  | { type: 'post'; level: number };

/**
 * `t0` is the first frame after the load finished. Starts at the top stage. `post` is where the
 * post-processing axis starts: `POST_FULL` with a composer, `POST_OFF` (the default) without one.
 */
export function initialQuality(t0: number, post: number = POST_OFF): QualityState {
  return {
    stage: 0,
    post,
    hidden: false,
    ignoreUntil: t0 + WARMUP_MS,
    lastChangeAt: -Infinity,
    belowSince: null,
    aboveSince: null,
    calmSince: null,
    lastUpAt: -Infinity,
    upBlockedUntil: -Infinity,
    backoffMs: BACKOFF_START_MS,
    dropCheck: null,
    floor: null,
    degradedSince: null,
  };
}

const NO_TIMERS = { belowSince: null, aboveSince: null, calmSince: null, degradedSince: null } as const;

function lower(stages: readonly number[], stage: number): number | null {
  for (const s of stages) if (s > stage) return s;
  return null;
}

function higher(stages: readonly number[], stage: number): number | null {
  let found: number | null = null;
  for (const s of stages) if (s < stage) found = s;
  return found;
}

/** The single place that decides the stage. */
export function stepQuality(s: QualityState, e: QualityEvent, ladder: Ladder, th: Thresholds): QualityState {
  switch (e.type) {
    case 'hidden':
      return { ...s, ...NO_TIMERS, hidden: true };
    case 'visible':
      return {
        ...s,
        ...NO_TIMERS,
        hidden: false,
        ignoreUntil: Math.max(s.ignoreUntil, e.t + RESUME_IGNORE_MS),
      };
    case 'override':
      return {
        ...s,
        ...NO_TIMERS,
        lastUpAt: -Infinity,
        upBlockedUntil: -Infinity,
        backoffMs: BACKOFF_START_MS,
        dropCheck: null,
        floor: null,
      };
    case 'post':
      return e.level > s.post ? { ...s, post: Math.min(e.level, POST_OFF) } : s;
    case 'sample':
      return sample(s, e.t, e.fps, e.forced === true, ladder, th);
  }
}

function sample(
  s: QualityState,
  t: number,
  fps: number,
  forced: boolean,
  ladder: Ladder,
  th: Thresholds,
): QualityState {
  if (s.hidden || t < s.ignoreUntil || !Number.isFinite(fps)) return { ...s, ...NO_TIMERS };

  const probeLevel = (th.down + th.up) / 2;
  // While ups are blocked their holds do not run: once unblocked, a full hold is needed again.
  const upBlocked = t < s.upBlockedUntil;
  const belowSince = fps < th.down ? (s.belowSince ?? t) : null;
  const aboveSince = !upBlocked && fps > th.up ? (s.aboveSince ?? t) : null;
  const calmSince = !upBlocked && fps >= probeLevel ? (s.calmSince ?? t) : null;
  const degradedSince = s.floor !== null && fps < s.floor.fps * FLOOR_LOSS ? (s.degradedSince ?? t) : null;
  const lifted = fps > th.up || (degradedSince !== null && t - degradedSince >= DOWN_HOLD_MS);
  const floor = lifted ? null : s.floor;
  const next = { ...s, belowSince, aboveSince, calmSince, floor, degradedSince: floor ? degradedSince : null };
  if (t - s.lastChangeAt < COOLDOWN_MS) return next;

  if (s.dropCheck !== null) {
    const { from, fps: before } = s.dropCheck;
    if (forced || fps >= before * DROP_GAIN) return { ...next, dropCheck: null };
    // The drop bought nothing: undo it (not an up, so it is never a failed up) and stop dropping.
    return { ...next, ...NO_TIMERS, stage: from, lastChangeAt: t, dropCheck: null, floor: { stage: from, fps } };
  }

  const down = lower(ladder.stages, s.stage);
  const floored = floor !== null && s.stage >= floor.stage;
  const slow = belowSince !== null && t - belowSince >= DOWN_HOLD_MS;
  // Post-processing steps: N8AO before any stage, Bloom and the composer once the stages are spent.
  // Never checked or undone (a stall either way); the resolution timers start over after one.
  if (slow && (s.post === POST_FULL || (s.post < POST_OFF && down === null && !floored))) {
    return { ...next, ...NO_TIMERS, post: s.post + 1, lastChangeAt: t };
  }
  if (slow && down !== null && !floored) {
    const failedUp = t - s.lastUpAt <= FAIL_WINDOW_MS;
    return {
      ...next,
      ...NO_TIMERS,
      stage: down,
      lastChangeAt: t,
      lastUpAt: -Infinity,
      upBlockedUntil: failedUp ? t + s.backoffMs : s.upBlockedUntil,
      backoffMs: failedUp ? Math.min(s.backoffMs * 2, BACKOFF_MAX_MS) : s.backoffMs,
      dropCheck: { from: s.stage, fps },
    };
  }

  const up = higher(ladder.stages, s.stage);
  if (up === null || upBlocked) return next;
  const byThreshold = aboveSince !== null && t - aboveSince >= UP_HOLD_MS;
  const byProbe = calmSince !== null && t - calmSince >= PROBE_MS;
  if (byThreshold || byProbe) {
    return { ...next, ...NO_TIMERS, stage: up, lastChangeAt: t, lastUpAt: t };
  }
  return next;
}
