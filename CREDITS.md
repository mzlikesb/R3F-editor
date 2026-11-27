# Credits

| 에셋 | 출처 | 라이선스 | 사용 위치 |
| ---- | ---- | -------- | --------- |
| Space Kit 2.0 (Kenney) — `machine_generatorLarge.glb`, `machine_barrelLarge.glb`, `hangar_roundGlass.glb`, `satelliteDish_large.glb`, `hangar_roundA.glb`, `rock_largeA.glb`, `rock_largeB.glb`, `rocks_smallA.glb`, `crater.glb` | https://kenney.nl/assets/space-kit (zip 안 `Models/GLTF format/`) | CC0 | `public/models/*.glb`(발전기·산소 탱크·온실·통신탑·거주 돔·바위·크레이터). `scripts/compress.sh`가 center·palette·join·Draco로 변환 |
| 위 Space Kit의 `rock_largeA.glb`, `rocks_smallA.glb`에서 만든 파생물 | (같은 출처) | CC0 | `public/models/rock-a-low.glb`, `public/models/rocks-small-low.glb`(먼 거리용 단순화 바위). `scripts/compress.sh --lod`(`scripts/rock-lod.mjs`)가 법선·UV를 빼고 weld·simplify·Draco로 만든다 |
| `kloofendal_48d_partly_cloudy_puresky` 1k HDR (Greg Zaal, Jarod Guest / Poly Haven) | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr (sha256 `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`) | CC0 | `public/hdri/sky-512.hdr`(512×256으로 축소, 간접광만) |
| Draco 디코더(`draco_wasm_wrapper.js`, `draco_decoder.wasm`) | 설치된 `three`의 `examples/jsm/libs/draco/gltf/` | Apache-2.0 | `public/draco/` |
