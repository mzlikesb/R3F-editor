import { ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';

/**
 * Why the sky and the fog match (008 R1, #104 QA): three mixes the fog colour into a material
 * *after* tone mapping and the output colour-space conversion, in the output colour space. An sRGB
 * texture as `scene.background` also skips tone mapping (`WebGLBackground`). So with the renderer's
 * tone mapping both come out as their plain hex, and under the composer (008-2: renderer
 * `NoToneMapping`, a linear target, the `ToneMapping` effect) both are tone mapped by the effect.
 * Fully fogged ground equals the sky's bottom colour either way. A tone-mapped sky mesh would break
 * that on the plain path. This guards the shader order a three upgrade could change.
 */
describe('fog is mixed after tone mapping', () => {
  for (const name of ['standard', 'physical', 'basic', 'lambert'] as const) {
    it(`${name}: fog_fragment comes after tonemapping_fragment and colorspace_fragment`, () => {
      const frag = ShaderLib[name].fragmentShader;
      const tone = frag.indexOf('#include <tonemapping_fragment>');
      const space = frag.indexOf('#include <colorspace_fragment>');
      const fog = frag.indexOf('#include <fog_fragment>');
      expect(tone).toBeGreaterThan(0);
      expect(space).toBeGreaterThan(tone);
      expect(fog).toBeGreaterThan(space);
    });
  }
});
