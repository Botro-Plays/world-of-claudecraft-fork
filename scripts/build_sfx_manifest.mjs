// Rebuild the sampled SFX runtime manifest without generating or editing audio.

import { relative } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { writeSfxGainCeilings } from './sfx/sfx_gain_ceiling.mjs';

const repoRoot = process.cwd();

// Ceilings FIRST, because the manifest validates against them. writeSfxManifest
// resolves every custom key's gain (category baseline + keyTrimDb) and bounds it
// by that key's entry in sfx_gain_ceiling.generated.json; a key with no entry
// there resolves against a 0dB ceiling and throws if its trim is positive.
// Since this file is also what PUTS a key into the ceiling record, running the
// manifest first meant a newly-added custom key could never bootstrap: the run
// threw, and the manifest was left stale on disk.
//
// That is a quiet failure. The command exits non-zero, but a stale manifest
// committed anyway simply omits the key from SFX_CLIPS, so the cue never loads
// and the game plays silence with nothing red anywhere. Two shipped cues were
// lost to exactly this before it was found.
//
// Safe as well as correct: ceilings are measured from the catalog and the audio
// files on disk and never read the manifest, so nothing here depends on the
// order that was swapped away.
//
// If the audio files are unavailable (LFS pointers not smudged, missing files,
// or a broken ffmpeg), regeneration throws. The checked-in ceiling file is
// untouched (writeSfxGainCeilings uses an atomic temp-file rename, so a throw
// in computeSfxGainCeilingRecords leaves the existing file intact). Fall back
// to it so the manifest build can proceed with the last real measured ceilings
// instead of crashing the build. This is not a silent pass: the manifest
// validator still rejects any gain trim that exceeds the checked-in ceiling.
try {
  const { path: ceilingPath, ceilings } = writeSfxGainCeilings(repoRoot, ffmpegPath);
  console.log(
    `SFX gain ceilings: ${Object.keys(ceilings).length} custom keys -> ${relative(repoRoot, ceilingPath)}`,
  );
} catch (error) {
  console.warn(
    `SFX gain ceiling regeneration failed, using checked-in file: ${error.message ?? error}`,
  );
}

// Regenerated in the SAME step as the ceilings above so the two can never
// silently drift: any change to a custom key's audio, or to which keys are
// marked custom, is reflected in both on the very next build.
//
// Import the manifest builder only after the generated ceiling file is current.
// manifest.mjs imports playback_profile.mjs, whose module-scope ceiling cache is
// populated while that module is evaluated.
const { writeSfxManifest } = await import('./sfx/manifest.mjs');
const { path, runtimePath, entries } = writeSfxManifest(repoRoot);
console.log(`SFX manifest: ${Object.keys(entries).length} clips -> ${relative(repoRoot, path)}`);
console.log(`SFX runtime pack: ${relative(repoRoot, runtimePath)}`);
