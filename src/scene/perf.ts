/** True when the page was opened with `?perf`. */
export const PERF_ENABLED = new URLSearchParams(window.location.search).has('perf');

/**
 * Draw calls under the composer (008 R6), for `PerfHud`: `scene` is read right after the render
 * pass, `total` after the last pass; the rest is post-processing. `on` while the composer draws.
 */
export const POST_INFO = { on: false, scene: 0, sceneTriangles: 0, total: 0 };
