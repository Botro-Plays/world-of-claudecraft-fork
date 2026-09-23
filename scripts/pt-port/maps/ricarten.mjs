// PtMapManifest for Ricarten (field index 3 in PT-Source/field.cpp).
//
// This is the golden-reference map: every value here is sourced from the
// authored registry (psField[3] in field.cpp) or the shipped client tree.
// The generic compiler consumes only this manifest - no `if (map === ...)`
// branches exist in the compiler itself.
//
// Paths are relative to the PT client dir (PT_CLIENT_DIR or the MagicPT
// checkout default) for sources, and to the WoC repo root for outputs.

const stageObjectFiles = Array.from(
  { length: 14 },
  (_, i) => `v-ani${String(i + 1).padStart(2, '0')}.smd`,
);

export default {
  // Identity (field.cpp psField[3]).
  id: 'ricarten',
  fieldIndex: 3,
  mapName: 'village-2',
  state: 'FIELD_STATE_VILLAGE',

  // Terrain SMD. field.cpp registers the .ase authoring path; the shipped
  // client carries the compiled .smd under Field/Ricarten/.
  smdPath: 'Field/Ricarten/village-2.smd',
  fieldOut: 'src/sim/pt_ricarten_field.generated.ts',

  // Label baked into the generated header. Honest client-relative path -
  // the legacy compiler emitted 'client/Field/Village-2/village-2.smd'
  // (capitalized mapName quirk); the manifest now records the real path.
  sourceLabel: 'client/Field/Ricarten/village-2.smd',

  // Animated stage objects (field.cpp AddStageObject v-ani01..v-ani14).
  stageObjects: {
    dir: 'Field/Ricarten',
    files: stageObjectFiles,
    out: 'src/render/pt_stage_objects.generated.ts',
  },

  // Texture conversion: source dir inside the client tree, generated PNG
  // dir under public/. Converter reads PT_TEXTURE_MANIFEST from fieldOut.
  texturesDir: 'Field/Ricarten',
  textureOutDir: 'public/textures/pt-ricarten',

  // Water classification. 'translucent' = smMATERIAL::Transparency > 0.1,
  // which on Ricarten selects exactly the proven set {107,140,232} (mat 140
  // lacks the WATER script bit - translucency is the correct discriminator).
  water: { rule: 'translucent' },

  // Optional components.
  minimap: 'Field/map/village-2.tga',

  // Authored coordinates (PT world units, from field.cpp).
  centerPos: [2596, -18738],
  startPoints: [
    [2592, -18566],
    [-1047, -16973],
  ],
  gates: [],
};
