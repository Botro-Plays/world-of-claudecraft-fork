import { ptRicartenGroundHeight, ptRicartenSpawnY, ptRicartenSupportHeight } from '../../src/sim/pt_ricarten_field';
import { PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z } from '../../src/sim/pt_band';
const g = ptRicartenGroundHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
const s = ptRicartenSpawnY(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
console.log('spawn X/Z:', PT_RICARTEN_SPAWN_X.toFixed(2), PT_RICARTEN_SPAWN_Z.toFixed(2));
console.log('groundHeight at spawn:', g);
console.log('spawnY:', s);
console.log('support at spawn+1yd reach:', ptRicartenSupportHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z, 0.5, g + 1));
