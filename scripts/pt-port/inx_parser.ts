// INX parser for Priston Tale .inx files (smMODELINFO binary dump)
// The .inx file is a raw binary dump of the smMODELINFO struct (95268 bytes).
// Animation frame ranges (StartFrame/EndFrame) are XOR-scrambled with a filename
// checksum (GetSpeedSum). The decode reassembles original bytes from the
// MotionKeyWord and Frame fields without needing the key.

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZE_MODELINFO = 95268;
const SIZE_MOTIONINFO = 172;
const MOTION_INFO_MAX = 512;
const CHRMOTION_EXT = 10;

// Offsets within smMODELINFO
const OFF_szModelFile = 0;       // char[64]
const OFF_szMotionFile = 64;     // char[64]
const OFF_szSubModelFile = 128;  // char[64]
const OFF_MotionInfo = 396;      // smMOTIONINFO[512]
const OFF_MotionCount = 88460;   // DWORD

// Offsets within smMOTIONINFO
const MOFF_State = 0;            // DWORD
const MOFF_MotionKeyWord_1 = 4;  // DWORD
const MOFF_StartFrame = 8;       // DWORD
const MOFF_MotionKeyWord_2 = 12; // DWORD
const MOFF_EndFrame = 16;        // DWORD
const MOFF_EventFrame = 20;      // DWORD[4]
const MOFF_ItemCodeCount = 36;   // int
const MOFF_ItemCodeList = 40;    // WORD[52]
const MOFF_dwJobCodeBit = 144;   // DWORD
const MOFF_SkillCodeList = 148;  // BYTE[8]
const MOFF_MapPosition = 156;    // int
const MOFF_Repeat = 160;         // DWORD
const MOFF_KeyCode = 164;        // CHAR
const MOFF_MotionFrame = 168;    // int

// Animation state constants (from character.h)
const STATE_NAMES: Record<number, string> = {
  0x40: 'STAND',
  0x50: 'WALK',
  0x60: 'RUN',
  0x80: 'FALLDOWN',
  0x100: 'ATTACK',
  0x110: 'DAMAGE',
  0x120: 'DEAD',
  0x130: 'SOMETIME',
  0x140: 'EAT',
  0x150: 'SKILL',
  0x170: 'FALLSTAND',
  0x180: 'FALLDAMAGE',
  0x200: 'RESTART',
  0x210: 'WARP',
  0x220: 'YAHOO',
  0x300: 'HAMMER',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PTMotionInfo {
  state: number;
  stateName: string;
  startFrame: number;
  endFrame: number;
  repeat: boolean;
  motionFrame: number; // 1-based index into SMB TmFrame array
  eventFrames: number[];
}

export interface PTModelInfo {
  modelFile: string;
  motionFile: string;
  subModelFile: string;
  motionCount: number;
  motions: PTMotionInfo[];
}

// ---------------------------------------------------------------------------
// Binary reader helpers
// ---------------------------------------------------------------------------

function readUInt32(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

function readInt32(buf: Buffer, off: number): number {
  return buf.readInt32LE(off);
}

function readFixedString(buf: Buffer, off: number, len: number): string {
  const end = buf.indexOf(0, off);
  return buf.toString('ascii', off, end === -1 ? off + len : Math.min(end, off + len));
}

// ---------------------------------------------------------------------------
// MotionKeyWord decode (reverses MotionKeyWordEncode)
// ---------------------------------------------------------------------------

function decodeStartFrame(kw1: number, startFrame: number): number {
  return (
    ((startFrame & 0x000000ff) << 24) |
    (startFrame & 0x00ff0000) |
    ((kw1 & 0x00ff0000) >> 8) |
    (kw1 & 0x000000ff)
  ) >>> 0;
}

function decodeEndFrame(kw2: number, endFrame: number): number {
  return (
    ((kw2 & 0x00ff0000) << 8) |
    ((kw2 & 0x000000ff) << 16) |
    ((endFrame & 0x00ff0000) >> 8) |
    (endFrame & 0x000000ff)
  ) >>> 0;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseInx(buf: Buffer): PTModelInfo {
  if (buf.length !== SIZE_MODELINFO) {
    throw new Error(`Invalid INX file size: ${buf.length} (expected ${SIZE_MODELINFO})`);
  }

  const modelFile = readFixedString(buf, OFF_szModelFile, 64);
  const motionFile = readFixedString(buf, OFF_szMotionFile, 64);
  const subModelFile = readFixedString(buf, OFF_szSubModelFile, 64);
  const motionCount = readUInt32(buf, OFF_MotionCount);

  const motions: PTMotionInfo[] = [];

  for (let i = CHRMOTION_EXT; i < motionCount; i++) {
    const off = OFF_MotionInfo + i * SIZE_MOTIONINFO;

    const state = readUInt32(buf, off + MOFF_State);
    const kw1 = readUInt32(buf, off + MOFF_MotionKeyWord_1);
    const rawStart = readUInt32(buf, off + MOFF_StartFrame);
    const kw2 = readUInt32(buf, off + MOFF_MotionKeyWord_2);
    const rawEnd = readUInt32(buf, off + MOFF_EndFrame);
    const repeat = readUInt32(buf, off + MOFF_Repeat) !== 0;
    const motionFrame = readInt32(buf, off + MOFF_MotionFrame);

    const eventFrames: number[] = [];
    for (let j = 0; j < 4; j++) {
      eventFrames.push(readUInt32(buf, off + MOFF_EventFrame + j * 4));
    }

    // Decode frame ranges (entries before CHRMOTION_EXT are not encoded)
    let startFrame: number;
    let endFrame: number;

    if (i >= CHRMOTION_EXT && (kw1 !== 0 || rawStart !== 0)) {
      startFrame = decodeStartFrame(kw1, rawStart);
    } else {
      startFrame = rawStart;
    }

    if (i >= CHRMOTION_EXT && (kw2 !== 0 || rawEnd !== 0)) {
      endFrame = decodeEndFrame(kw2, rawEnd);
    } else {
      endFrame = rawEnd;
    }

    motions.push({
      state,
      stateName: STATE_NAMES[state] ?? `UNKNOWN(0x${state.toString(16)})`,
      startFrame,
      endFrame,
      repeat,
      motionFrame,
      eventFrames,
    });
  }

  return { modelFile, motionFile, subModelFile, motionCount, motions };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('inx_parser.ts')) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/pt-port/inx_parser.ts <file.inx>');
    process.exit(1);
  }

  const buf = readFileSync(file);
  const info = parseInx(buf);

  console.log(`Model: ${info.modelFile}`);
  console.log(`Motion: ${info.motionFile}`);
  console.log(`SubModel: ${info.subModelFile || '(none)'}`);
  console.log(`MotionCount: ${info.motionCount}`);
  console.log('\nAnimations:');
  for (const m of info.motions) {
    console.log(`  ${m.stateName.padEnd(12)} frames ${m.startFrame}-${m.endFrame} repeat=${m.repeat} motionFrame=${m.motionFrame}`);
  }
}
