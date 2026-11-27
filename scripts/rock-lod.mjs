// Far-level rock meshes for the LOD cells (plan 007 B.8): `node scripts/rock-lod.mjs <in.glb> <out.glb> <ratio>`.
// The Kenney rocks are flat shaded, so every face has its own vertices and the simplifier cannot
// merge anything. Normals, UVs and the palette texture are dropped (far away a rock is one colour:
// the scene gives both far levels one flat shaded material), the vertices welded, the mesh
// simplified with gltf-transform's `simplify` (meshoptimizer) and Draco compressed.
// Built from the committed models: run by `scripts/compress.sh`, output committed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune, simplify, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output, ratioArg] = process.argv.slice(2);
if (!input || !output || !ratioArg) {
  console.error('usage: node scripts/rock-lod.mjs <in.glb> <out.glb> <ratio>');
  process.exit(2);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(input);
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const name of ['NORMAL', 'TEXCOORD_0', 'TEXCOORD_1']) prim.setAttribute(name, null);
for (const m of doc.getRoot().listMaterials()) m.setBaseColorTexture(null);
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratioArg), error: 0.05 }),
  prune(),
  draco(),
);
await io.write(output, doc);
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    console.log(`${output}: ${idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3} triangles`);
  }
