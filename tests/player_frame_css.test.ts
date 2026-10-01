import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const playHtml = readFileSync(new URL('../play.html', import.meta.url), 'utf8');

function ruleBlock(selector: string): string {
  const start = hudCss.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  return hudCss.slice(start, hudCss.indexOf('}', start));
}

describe('desktop player frame sizing', () => {
  it('keeps the full configured player frame width after dragging detaches it', () => {
    // The box is the playerFrameWidth setting scaled by the frame scale
    // (real-dimension sizing from the interface editor), and the docked and
    // detached seats carry the SAME expression: any difference between the
    // two renders as the content jumping sideways the moment a drag starts.
    const widthExpr =
      'width: calc(var(--player-frame-width, 612px) * var(--player-frame-scale, 1));';
    const docked = ruleBlock('#player-frame {');
    const detached = ruleBlock('#player-frame.pf-detached {');
    expect(docked).toContain(widthExpr);
    expect(detached).toContain(widthExpr);
    expect(hudCss).not.toContain('#player-frame.pf-detached .uf-bars');
  });
});

describe('party frame bar sizing', () => {
  it('the hp/resource bars absorb a partyFrameHeight drag like the other unit frames', () => {
    // The row height is the setting; the name line plus padding cost about
    // 24px and the remainder splits across the two bars, landing on the
    // stock 9px at the stock 42px row. A fixed bar height here is the bug
    // the owner reported: rows grew while the health bars stayed 9px.
    const bar = ruleBlock('.party-frame .bar {');
    expect(bar).toContain('height: max(4px, calc((var(--party-frame-height, 42px) - 24px) / 2));');
  });
});

describe('snap-to-grid alignment overlay', () => {
  it('draws its lines on the FRAME_SNAP_GRID pitch in VISUAL px', () => {
    // FRAME_SNAP_GRID is 16 (pinned in tests/target_frame_pos.test.ts) and
    // every snap quantizes VISUAL px, but the overlay lives inside #ui,
    // which zooms by --ui-scale: the author-space pitch must divide by the
    // scale so the zoom lands the drawn lines back on 16 visual px. A plain
    // 16px here drew the grid offset from where snaps land at any UI Scale
    // other than 1 (review round four, blocker 1).
    const overlay = hudCss.slice(hudCss.indexOf('#interface-grid-overlay {'));
    const block = overlay.slice(0, overlay.indexOf('}'));
    const pitches = block.match(/transparent 1px calc\(16px \/ var\(--ui-scale, 1\)\)/g) ?? [];
    expect(pitches, 'both gradients carry the scale-compensated pitch').toHaveLength(2);
    expect(block).toContain('repeating-linear-gradient');
    // No uncompensated pitch may survive in the block.
    expect(block).not.toMatch(/transparent 1px 16px/);
    expect(block).toContain('pointer-events: none;');
  });

  it('draws a scale-compensated centerline pair through the screen middle', () => {
    // The two ::before/::after bars are overlay children, so they show and
    // hide with the grid; like the grid pitch, their px thickness divides by
    // --ui-scale (the 50% midpoint needs no compensation).
    const overlay = hudCss.slice(hudCss.indexOf('#interface-grid-overlay {'));
    expect(overlay).toMatch(
      /#interface-grid-overlay::before\s*\{[\s\S]*?left:\s*calc\(50% - 1px \/ var\(--ui-scale, 1\)\);[\s\S]*?width:\s*calc\(2px \/ var\(--ui-scale, 1\)\);/,
    );
    expect(overlay).toMatch(
      /#interface-grid-overlay::after\s*\{[\s\S]*?top:\s*calc\(50% - 1px \/ var\(--ui-scale, 1\)\);[\s\S]*?height:\s*calc\(2px \/ var\(--ui-scale, 1\)\);/,
    );
  });
});

// Regression pin for the buff-placement bug: the anchored buff row's
// above/below side used to be keyed on #player-frame.pf-detached (whether the
// player has ever dragged/nudged the frame, or loaded a saved position), so
// moving the frame even once silently and permanently flipped the buffs below
// it. It is now keyed on its OWN class (body.auras-below-frame), driven by the
// dedicated auraBarBelowFrame setting (main.ts), never by the frame's move
// state.
describe('player frame buff-row placement (auraBarBelowFrame)', () => {
  it('sits above the frame by default', () => {
    const docked = ruleBlock('#player-frame > #buff-bar {');
    expect(docked).toContain('bottom: calc(100% + 8px);');
  });

  it('flips below the frame only via its own body.auras-below-frame class', () => {
    const below = ruleBlock('body.auras-below-frame #player-frame > #buff-bar {');
    expect(below).toContain('top: calc(100% + 8px);');
  });

  it('never re-couples the buff row to the frame drag/detach state', () => {
    const detached = ruleBlock(
      'body.auras-on-frame.auras-below-frame #player-frame.pf-detached > #buff-bar {',
    );
    expect(detached).not.toMatch(/\b(?:top|bottom):/);
  });

  // A docked (never-dragged) frame has no z-index of its own, so before this
  // fix "buffs below" only ever coexisted with pf-detached (which does carry
  // z-index: 6): a docked frame flipped below is a combination this fix newly
  // makes reachable, and without a matching z-index the flipped icon painted
  // behind the action bar's buttons (same DOM-order stacking, no positioning
  // to override it). The z-index lands on the row itself, not the whole
  // frame, so the portrait/bars never get hoisted into a needless new
  // stacking context. Caught via the PR screenshot capture, not a unit test.
  it('lifts the flipped row (not the whole frame) above the action bar', () => {
    const lifted = ruleBlock('body.auras-on-frame.auras-below-frame #player-frame > #buff-bar {');
    expect(lifted).toContain('z-index: 6;');
  });

  // The docked 8px gap has no room to clear the action bar's first slot
  // entirely without reflowing #actionbar-stack, so the row's visibility (via
  // the z-index above) trades away its own clickability here: a click in the
  // overlap reaches the action button underneath, never the buff icon. The
  // action slot is the more safety-critical of the two.
  it('lets clicks in the overlap reach the action bar, not the buff icon', () => {
    const lifted = ruleBlock('body.auras-on-frame.auras-below-frame #player-frame > #buff-bar {');
    expect(lifted).toContain('pointer-events: none;');
  });

  it('keeps detached buff icons interactive below the player frame', () => {
    const detached = ruleBlock(
      'body.auras-on-frame.auras-below-frame #player-frame.pf-detached > #buff-bar {',
    );
    expect(detached).toContain('pointer-events: auto;');
  });
});

describe('Rising vital cluster', () => {
  it('paints HP as an opaque glossy red fill, matching MP construction', () => {
    const hp = ruleBlock('#player-frame .pt-vitals > .bar.hp > .bar-fill {');
    expect(hp).toContain('linear-gradient(180deg, #ff6b5c 0%, #d4181c 50%, #8a0a0a 100%)');
    expect(hp).toContain('opacity: 1;');
    expect(hp).not.toContain('repeating-linear-gradient');
    expect(hp).not.toContain('hp-ornate');
    expect(ruleBlock('#player-frame .pt-vitals > .bar.hp {')).toContain('background: #3a0c0c;');
    expect(hudCss).not.toContain('#player-frame .pt-vitals > .bar.hp > .bar-absorb');
  });

  it('keeps MP and STM 3px under HP, with the portrait overlapping both rows', () => {
    const vitals = ruleBlock('#player-frame .pt-vitals {');
    expect(vitals).toContain('--pt-vital-gap: 3px;');
    expect(vitals).toContain('grid-template-rows: var(--pt-vital-h) var(--pt-vital-h);');
    expect(vitals).toContain('min-height: var(--pt-jewel);');
    expect(ruleBlock('#player-frame .pt-vitals > .bar.hp {')).toContain('grid-column: 1 / -1;');
    const jewel = ruleBlock('#player-frame .pt-vitals > #pf-portrait-wrap {');
    expect(jewel).toContain('position: absolute;');
    expect(jewel).toContain('transform: translate(-50%, -50%);');
    expect(jewel).not.toContain('grid-row: 2;');
    expect(ruleBlock('#player-frame .pt-vitals > #pf-resource {')).toContain('grid-row: 2;');
    expect(ruleBlock('#player-frame .pt-vitals > #pf-stamina {')).toContain('grid-column: 3;');
    expect(indexHtml).toContain('id="pf-portrait-wrap"');
    expect(playHtml).toContain('id="pf-portrait-wrap"');
    expect(indexHtml).toContain('id="pf-stm-text"');
    expect(playHtml).toContain('id="pf-stm-text"');
    expect(indexHtml).not.toContain('id="pt-vital-jewel"');
    expect(indexHtml.indexOf('id="pt-mouse-l"')).toBeLessThan(
      indexHtml.indexOf('class="pt-vitals"'),
    );
    expect(indexHtml.indexOf('class="pt-vitals"')).toBeLessThan(
      indexHtml.indexOf('id="pt-mouse-r"'),
    );
  });

  it('paints three square labelled potion seats, empty until a flask is carried', () => {
    const wells = ruleBlock('#player-frame #pt-potion-wells.pt-potion-wells {');
    expect(wells).toContain('justify-content: center;');
    expect(wells).toContain('gap: 5px;');
    const slot = ruleBlock('#player-frame #pt-potion-wells .pt-potion-slot {');
    expect(slot).toContain('width: 50px;');
    expect(slot).toContain('height: 50px;');
    expect(slot).toContain('border-radius: 10px;');
    expect(slot).not.toContain('rotate(45deg)');
    expect(hudCss).toContain('image-rendering: pixelated;');
    expect(ruleBlock('#player-frame #pt-potion-wells .pt-potion-slot img {')).toContain(
      'width: 44px;',
    );
    expect(hudCss).toContain('.pt-slot-pill,');
    for (const html of [indexHtml, playHtml]) {
      expect(html).toContain('id="pt-potion-hp"');
      expect(html).toContain('id="pt-potion-mp"');
      expect(html).toContain('id="pt-potion-stm"');
      expect(html).toContain('data-i18n="hudChrome.vitals.hp"');
      expect(html).not.toContain('/ui/pt-hud/icon-hp-potion.png');
      expect(html).not.toContain('Potion shortcuts');
    }
  });
});

describe('PT combat deck', () => {
  it('keeps 1-0 and the F-row in one skill deck and parks AUTO to their left', () => {
    expect(hudCss).toContain('#pt-skill-deck > #actionbar.panel {');
    expect(hudCss).toContain('grid-template-columns: repeat(10, 42px);');
    expect(hudCss).toContain('#pt-skill-deck > #actionbar2.panel {');
    expect(hudCss).toContain('#pt-auto-cluster {');
    expect(hudCss).toContain('.pt-mouse-well-host {');
    expect(ruleBlock('#pt-auto-cluster {')).toContain('flex-direction: row;');
    expect(ruleBlock('#pt-auto-cluster {')).toContain('position: absolute;');
    expect(ruleBlock('#pt-auto-cluster {')).toContain('+ 12px');
    expect(ruleBlock('#pt-combat-deck {')).toContain('justify-content: center;');
    expect(hudCss).toMatch(/#xpbar,\n {2}#pt-combat-deck \{\n {4}flex: 1 0 100%;/);
    expect(ruleBlock('#pt-skill-deck {')).toContain('flex-direction: column;');
    expect(indexHtml).toContain('id="pt-combat-deck"');
    expect(indexHtml).toContain('id="pt-mouse-l"');
    expect(indexHtml).toContain('id="pt-mouse-r"');
    expect(playHtml).toContain('id="pt-combat-deck"');
    expect(playHtml).toContain('id="pt-auto-btn"');
    expect(indexHtml.indexOf('id="pt-auto-cluster"')).toBeLessThan(
      indexHtml.indexOf('id="pt-skill-deck"'),
    );
    expect(ruleBlock('#pt-auto-btn {')).toContain('url("/ui/pt-hud/auto-icon.png")');
    expect(ruleBlock('#pt-auto-btn {')).toContain('background-size: contain');
    expect(ruleBlock('#pt-auto-btn {')).not.toContain('border: 3px solid #e8c430');
    expect(ruleBlock('#pt-auto-settings {')).toContain('url("/ui/pt-hud/gear-icon.png")');
    expect(ruleBlock('#pt-auto-settings {')).toContain('background-size: contain');
    expect(ruleBlock('#pt-auto-settings {')).toContain('width: 26px;');
    expect(
      ruleBlock(
        '#pt-auto-btn.is-on,\n  body:has(.action-btn[data-hotbar-slot="0"].queued) #pt-auto-btn {',
      ),
    ).toContain('drop-shadow');
    expect(indexHtml).not.toContain('pt-auto-sword');
    expect(indexHtml).not.toContain('pt-auto-label');
    expect(playHtml).not.toContain('pt-auto-sword');
  });

  it('paints both skill rows as dark CSS slots inside one bronze panel', () => {
    const deck = ruleBlock('#pt-skill-deck {');
    expect(deck).toContain('background: #15130f;');
    expect(deck).toContain('border: 1px solid #6b5a3a;');
    const slot = ruleBlock('#pt-skill-deck .action-btn {');
    expect(slot).toContain('width: 42px;');
    expect(slot).toContain('height: 42px;');
    expect(slot).toContain('border-radius: 6px;');
    expect(slot).toContain('border: 1px solid #3d3529;');
    expect(slot).toContain('linear-gradient(180deg, #2a2622 0%, #1c1a17 100%)');
    expect(slot).not.toContain('skill-slot.png');
    expect(slot).not.toContain('clip-path: polygon');
    expect(ruleBlock('#pt-skill-deck > #actionbar.panel {')).toContain('column-gap: 4px;');
    expect(ruleBlock('#pt-skill-deck > #actionbar.panel {')).toContain('order: 1;');
    expect(ruleBlock('#pt-skill-deck > #actionbar2.panel {')).toContain('order: 2;');
    expect(ruleBlock('#pt-skill-deck .action-btn .keybind {')).toContain('color: #cfc6b0;');
    expect(ruleBlock('#pt-skill-deck .action-btn .keybind {')).toContain('left: 3px;');
    expect(ruleBlock('#pt-skill-deck .action-btn.empty {')).not.toContain('skill-slot.png');
  });
});
