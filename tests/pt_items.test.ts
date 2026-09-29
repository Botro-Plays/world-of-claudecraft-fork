// PT item canonical-catalog coverage (Phase 1: source-authentic catalog +
// English localization). Pins the generated artifacts emitted by
// scripts/pt-port/pt_npcs.mjs -> lib/pt_items.mjs:
//   generated/pt-maps/pt_item_catalog.generated.ts  (items + variants + rules)
//   generated/pt-maps/pt_mob_catalog.generated.ts   (monster drop tables)
//   src/sim/content/pt_items.ts                      (runtime ItemDef mapping)
//   src/ui/i18n.catalog/items.ts                     (en names / id registry)
//
// These tests assert on GENERATED data, not the live MagicPT source tree (the
// source path is a dev-machine absolute path and is not available in CI), so
// they pin the emitted contract: counts, collision outcomes, English-name
// coverage, and the runtime mapping.

import { describe, expect, it } from 'vitest';

import {
  PT_ITEM_CATALOG,
  PT_ITEM_COLLISIONS,
  PT_ITEM_EN_NAMES,
  PT_ITEM_RULES,
  PT_ITEM_VARIANTS,
} from '../generated/pt-maps/pt_item_catalog.generated';
import { PT_MOB_CATALOG } from '../generated/pt-maps/pt_mob_catalog.generated';
import { PT_MONSTER_REGISTRY } from '../generated/pt-maps/monster_registry.generated';
import { PT_ITEMS, ptItemId } from '../src/sim/content/pt_items';
import { ITEMS } from '../src/sim/data';
import { itemDisplayName } from '../src/ui/entity_i18n';
import { zh_CN } from '../src/ui/i18n.locales/zh_CN';
import { zh_TW } from '../src/ui/i18n.locales/zh_TW';

type CatalogEntry = {
  code: string;
  name: string | null;
  nameEn: string;
  nameEnSource: 'sitem' | 'file' | 'translated' | 'source';
  family: string;
  kind: string;
  price: number | null;
  restore: { hp: number[] | null; mp: number[] | null; sp: number[] | null } | null;
  requirements: { level?: number | null } | null;
  sitem: { name: string | null; itemClass: string; dropItem: string | null } | null;
  source: { file: string; duplicates?: string[]; variants?: string[] };
  variantOf?: string;
};

const CATALOG = PT_ITEM_CATALOG as Record<string, CatalogEntry>;
const VARIANTS = PT_ITEM_VARIANTS as Record<string, CatalogEntry>;
const EN_NAMES = PT_ITEM_EN_NAMES as Record<string, string>;
const MOBS = PT_MOB_CATALOG as Record<
  string,
  {
    drops: {
      pools: { weight: number; gold: [number, number] | null; items: string[] }[];
      bonus: { per10k: number; code: string }[];
      limit: number | null;
      eventItem: string | null;
      allSee: boolean;
    };
  }
>;

const CJK = /[ᅀ-ᅟ가-힯぀-ヿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￠]/;

describe('PT item canonical catalog', () => {
  it('covers all 1,902 source *代码 item codes', () => {
    expect(Object.keys(CATALOG)).toHaveLength(1902);
    for (const [key, rec] of Object.entries(CATALOG)) {
      expect(rec.code).toBe(key);
      expect(rec.source.file).toMatch(/\.txt$/i);
    }
  });

  it('preserves all 22 collision variants as distinct keyed records', () => {
    expect(Object.keys(VARIANTS)).toHaveLength(22);
    for (const [stem, rec] of Object.entries(VARIANTS)) {
      // A variant's own *代码 points at the base record it shares a code with.
      expect(rec.variantOf).toBe(rec.code);
      expect(CATALOG[rec.code]).toBeDefined();
      expect(rec.variantOf).not.toBe(stem);
    }
  });

  it('resolves the DA156/DA157 filename-vs-code collision without overwrite', () => {
    // DA156.txt and DA157.txt both declare *代码 DA156. The stem-matching
    // file is the canonical record; DA157 keeps its own data as a variant.
    expect(CATALOG.DA156.source.file).toBe('DA156.txt');
    expect(CATALOG.DA156.source.variants).toEqual(['DA157']);
    expect(VARIANTS.DA157.code).toBe('DA156');
    expect(VARIANTS.DA157.source.file).toBe('DA157.txt');
    // The two source records carry different zh names (礼服男 vs 礼服女) —
    // pre-fix the later file silently overwrote the first.
    expect(VARIANTS.DA157.name).not.toBe(CATALOG.DA156.name);
    expect(PT_ITEMS[ptItemId('DA156')]).toBeDefined();
    expect(PT_ITEMS[ptItemId('DA157')]).toBeDefined();
  });

  it('resolves the DB121/DB130 collision (the old catalog corrupted both)', () => {
    // DB130.txt declares *代码 DB121 and previously overwrote DB121's record
    // (幻影战靴 name, 800000 price, level 100 over 凤凰战靴).
    expect(CATALOG.DB121.source.file).toBe('DB121.txt');
    expect(CATALOG.DB121.name).toBe('凤凰战靴');
    expect(VARIANTS.DB130.code).toBe('DB121');
    expect(VARIANTS.DB130.name).toBe('幻影战靴');
    // Both resolve the shared DB121 client-table name (English client behavior
    // is code-keyed); the provenance split is on the source record.
    expect(PT_ITEMS[ptItemId('DB130')].name).toBe(VARIANTS.DB130.nameEn);
  });

  it('keeps OA145 stray duplicate files as provenance, not records', () => {
    expect(CATALOG.OA145.source.file).toBe('OA145.txt');
    expect(CATALOG.OA145.source.duplicates?.length).toBeGreaterThanOrEqual(1);
    // Identical duplicates must not mint variants.
    expect(Object.values(VARIANTS).some((v) => v.source.file.startsWith('OA145'))).toBe(false);
  });

  it('preserves all 20 QW* quest-weapon variants under their file stems', () => {
    const qw = Object.keys(VARIANTS).filter((k) => /^QW[A-Z]/.test(k));
    expect(qw).toHaveLength(20);
    for (const stem of ['QWA108', 'QWC120', 'QWD109', 'QWH109', 'QWN109', 'QWP109', 'QWS110', 'QWT109']) {
      expect(VARIANTS[stem]).toBeDefined();
      expect(PT_ITEMS[ptItemId(stem)]).toBeDefined();
    }
    // The QW variants share base weapon codes; the base records survive intact.
    expect(CATALOG.WA108.source.variants).toContain('QWA108');
  });

  it('emits a collision report covering every duplicated code', () => {
    const reported = PT_ITEM_COLLISIONS as { code: string; variants: string[] }[];
    expect(reported.length).toBeGreaterThanOrEqual(23);
    const byCode = new Map(reported.map((c) => [c.code, c]));
    expect(byCode.get('DA156')?.variants).toEqual(['DA157']);
    expect(byCode.get('DB121')?.variants).toEqual(['DB130']);
    // Every emitted variant is reachable from its collision report entry.
    for (const [stem, rec] of Object.entries(VARIANTS)) {
      expect(byCode.get(rec.code)?.variants).toContain(stem);
    }
  });

  it('carries the source NotSell/NotDrop rule tables', () => {
    const rules = PT_ITEM_RULES as {
      notSell: string[];
      notSellKinds: string[];
      notDropKinds: string[];
    };
    expect(rules.notSell).toEqual(expect.arrayContaining(['QT107', 'QT108']));
    expect(rules.notSellKinds).toContain('ITEM_KIND_QUEST_WEAPON');
  });
});

describe('PT item English localization', () => {
  it('gives every catalog and variant record a non-empty English name', () => {
    for (const rec of [...Object.values(CATALOG), ...Object.values(VARIANTS)]) {
      expect(rec.nameEn.length).toBeGreaterThan(0);
      expect(['sitem', 'file', 'translated', 'source']).toContain(rec.nameEnSource);
    }
  });

  it('keeps no CJK characters in player-facing English names', () => {
    for (const [id, name] of Object.entries(EN_NAMES)) {
      expect(CJK.test(name), `${id}: ${name}`).toBe(false);
    }
    expect(Object.keys(EN_NAMES)).toHaveLength(1924);
  });

  it('joins authentic sItem[] English names for the covered majority', () => {
    const counts = { sitem: 0, file: 0, translated: 0, source: 0 };
    for (const rec of [...Object.values(CATALOG), ...Object.values(VARIANTS)]) {
      counts[rec.nameEnSource]++;
    }
    // ~909 authentic English sItem names were verified during the audit; the
    // authored table covers every remaining non-English source name.
    expect(counts.sitem).toBeGreaterThan(850);
    expect(counts.translated).toBeGreaterThan(900);
    for (const rec of Object.values(CATALOG)) {
      if (rec.nameEnSource === 'sitem') {
        // nameEn is the sItem name with whitespace normalized.
        expect(rec.sitem?.name?.replace(/\s+/g, ' ').trim()).toBe(rec.nameEn);
      }
    }
  });

  it('keeps the source-language name on the record for provenance only', () => {
    // Sample: source zh preserved on the catalog record while the ItemDef
    // and display layer carry English.
    const rec = CATALOG.PL101;
    expect(rec.name).toBeTruthy();
    expect(CJK.test(rec.name!)).toBe(true);
    expect(PT_ITEMS.pt_pl101.name).toBe(rec.nameEn);
  });

  it('resolves player-facing English via itemDisplayName for every pt_* item', () => {
    const spotIds = ['pt_wa101', 'pt_pl101', 'pt_qwa108', 'pt_da157', 'pt_db130', 'pt_bc109'];
    for (const id of spotIds) {
      const def = ITEMS[id];
      expect(def, id).toBeDefined();
      const name = itemDisplayName(def);
      expect(CJK.test(name), `${id}: ${name}`).toBe(false);
      expect(name.length).toBeGreaterThan(0);
    }
    // Every registered pt_* def's display name equals its catalog nameEn.
    for (const [id, def] of Object.entries(PT_ITEMS)) {
      expect(itemDisplayName(def), id).toBe(EN_NAMES[id]);
    }
  });

  it('kept zh overlays keyed for all PT ids including the new variants', () => {
    const zhCN = zh_CN as Record<string, string>;
    const zhTW = zh_TW as Record<string, string>;
    for (const id of Object.keys(EN_NAMES)) {
      const key = `entities.items.${id}.name`;
      expect(zhCN[key], `zh_CN ${key}`).toBeTruthy();
      expect(zhTW[key], `zh_TW ${key}`).toBeTruthy();
    }
  });
});

describe('PT item runtime mapping', () => {
  it('maps restore-bearing items to potion defs with rounded midpoints', () => {
    const rec = CATALOG.PL101;
    const def = ITEMS.pt_pl101;
    expect(def.kind).toBe('potion');
    const [lo, hi] = rec.restore!.hp!;
    expect(def.potionHp).toBe(Math.round((lo + hi) / 2));
  });

  it('derives sellValue at the source quarter-price buyback rate', () => {
    for (const rec of Object.values(CATALOG)) {
      const def = ITEMS[ptItemId(rec.code)];
      if (!rec.price) continue;
      expect(def.sellValue, rec.code).toBe(Math.max(1, Math.floor(rec.price / 4)));
      expect(def.buyValue, rec.code).toBe(rec.price);
    }
  });

  it('marks source quest/unique items as kind quest (NotSell guard)', () => {
    expect(ITEMS.pt_qt107.kind).toBe('quest');
    expect(ITEMS.pt_qt108.kind).toBe('quest');
    // QW quest-weapon variants carry the source *特殊 2 (UniqueItem) marker,
    // which emits kind 'questWeapon' and maps to the same sell-guarded def.
    for (const stem of Object.keys(VARIANTS).filter((s) => /^QW[A-Z]/.test(s))) {
      expect(ITEMS[ptItemId(stem)].kind, stem).toBe('quest');
    }
    // The four OR* unique rings carry the same source marker.
    for (const code of ['OR202', 'OR203', 'OR204', 'OR242']) {
      expect(ITEMS[ptItemId(code)].kind, code).toBe('quest');
    }
  });

  it('keeps equipment families as junk until the equipment phase maps them', () => {
    for (const rec of Object.values(CATALOG)) {
      const def = ITEMS[ptItemId(rec.code)];
      if (rec.kind === 'weapon' || rec.kind === 'armor' || rec.kind === 'accessory') {
        expect(def.kind, rec.code).toBe('junk');
      }
    }
  });

  it('registers a runtime def for every catalog key and variant stem', () => {
    for (const key of Object.keys(CATALOG)) expect(PT_ITEMS[ptItemId(key)], key).toBeDefined();
    for (const stem of Object.keys(VARIANTS)) expect(PT_ITEMS[ptItemId(stem)], stem).toBeDefined();
    expect(Object.keys(PT_ITEMS)).toHaveLength(1924);
  });
});

describe('PT monster drop-table extraction', () => {
  const REGISTRY = PT_MONSTER_REGISTRY as {
    drops: {
      pools: { weight: number; gold: [number, number] | null; items: string[] }[];
      bonus: { per10k: number; code: string }[];
      limit: number | null;
      eventItem: string | null;
      allSee: boolean;
    };
  }[];

  it('emits every source monster def with its drop table intact', () => {
    // The full registry covers all 411 source .inf files; 379 carry *物品
    // pools, 22 carry *增加物品 bonus drops (audit-verified counts).
    expect(REGISTRY).toHaveLength(411);
    expect(REGISTRY.filter((d) => d.drops.pools.length > 0)).toHaveLength(379);
    expect(REGISTRY.filter((d) => d.drops.bonus.length > 0)).toHaveLength(22);
    for (const def of REGISTRY) {
      for (const pool of def.drops.pools) {
        // Weight 0 is source-authored ('*物品 0 无' empty slots on
        // TowerGolem/StoneGiant/BigGhost); negative is never emitted.
        expect(pool.weight).toBeGreaterThanOrEqual(0);
        if (pool.gold) {
          expect(pool.gold[0]).toBeGreaterThanOrEqual(0);
          expect(pool.gold[1]).toBeGreaterThanOrEqual(pool.gold[0]);
          expect(pool.items).toHaveLength(0);
        }
        for (const code of pool.items) expect(code).toMatch(/^[A-Z0-9]+$/);
      }
      for (const bonus of def.drops.bonus) {
        // *增加物品 rolls rand()%10000 < N, so the bound is per-10,000.
        expect(bonus.per10k).toBeGreaterThan(0);
        expect(bonus.per10k).toBeLessThanOrEqual(10000);
        expect(bonus.code).toMatch(/^[A-Z0-9]+$/);
      }
    }
  });

  it('carries drops through to the field-referenced mob catalog', () => {
    // The mob catalog emits only keys referenced by live *ACTOR records; every
    // one of them is a source def with a *物品 pool.
    expect(Object.keys(MOBS).length).toBeGreaterThan(200);
    for (const mob of Object.values(MOBS)) {
      expect(mob.drops.pools.length).toBeGreaterThan(0);
    }
  });

  it('references only item codes that exist, plus the known source-orphans', () => {
    // Drop tables cite LastCategory codes the server resolves; 16 codes have
    // no OpenItem file in this distribution (verified against the source
    // tree - the same class of absence as vendored WV18/SW105).
    const KNOWN_ORPHAN_CODES = new Set([
      'DS206', 'FO126', 'FO127', 'OA10', 'OM205', 'OM206', 'OM207', 'OM208',
      'OS156', 'PM109', 'SA208', 'SP123', 'SP124', 'WN119', 'WT202', 'WT206',
    ]);
    const missing = new Set<string>();
    for (const def of REGISTRY) {
      for (const code of def.drops.pools.flatMap((p) => p.items)) {
        if (!CATALOG[code]) missing.add(code);
      }
      for (const b of def.drops.bonus) if (!CATALOG[b.code]) missing.add(b.code);
    }
    expect(missing).toEqual(KNOWN_ORPHAN_CODES);
  });
});
