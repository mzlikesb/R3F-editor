/** True when the page was opened with `?perf`. */
export const PERF_ENABLED = new URLSearchParams(window.location.search).has('perf');
