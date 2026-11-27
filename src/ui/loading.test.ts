import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The loading pill goes away in the same frame the HUD appears (neon art critique on #54). It used to
 * fade over 0.4 s, but the reveal lands on the heaviest frames (every model's shader compiles), so on
 * a phone the fade stalled for seconds with `기지를 불러오는 중…` over the generator while the HUD,
 * fault chip and hint were already up. Both follow `selectReady`; the pill must not lag behind.
 */
function rule(css: string, selector: string): string {
  const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
  return m?.[1] ?? '';
}

describe('loading pill CSS', () => {
  const css = readFileSync(new URL('../scene/scene.css', import.meta.url), 'utf8');

  it('hides at once when done: hidden, no transition', () => {
    const done = rule(css, '.loading-done');
    expect(done).toMatch(/visibility:\s*hidden/);
    expect(done).toMatch(/transition:\s*none/);
  });

  it('has no fade of its own that could outlive the reveal', () => {
    expect(rule(css, '.loading')).not.toMatch(/transition/);
  });
});
