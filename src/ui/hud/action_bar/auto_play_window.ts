// Cold Auto Play settings overlay. Gold-dark chrome; CSS owns the look.
// Open from the AUTO gear. Esc close rides Hud.closeAll via closeTop().
// Layout mirrors ToA General Auto Mode: behavior, leash, prioritize boss,
// separate Auto HP / MP / STM, then hunt seats.

import { audio } from '../../../game/audio';
import { ABILITIES } from '../../../sim/data';
import { abilityDisplayName } from '../../ability_display_name';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import { formatNumber, t } from '../../i18n';
import type { TranslationKey } from '../../i18n.catalog';
import { iconDataUrl } from '../../icons';
import {
  AUTO_PLAY_SLOT_COUNT,
  type AutoPlayGroup,
  type AutoPlayMode,
  type AutoPlaySettings,
  clampLeashYd,
  clampPct,
  clampRangeYd,
  loadAutoPlaySettings,
  saveAutoPlaySettings,
  setAutoPlaySlot,
} from './auto_play_settings_core';
import { type AutoPlayPick, autoPlayViewSignature, buildAutoPlayView } from './auto_play_view';

export interface AutoPlayWindowDeps {
  root(): HTMLElement;
  knownIds(): readonly string[];
  walkByAutoloot(): boolean;
  setWalkByAutoloot(on: boolean): void;
  isRunning(): boolean;
  onToggleAuto(): void;
}

export class AutoPlayWindow {
  private lastSig = '';
  private tab: 'hunt' | 'loot' = 'hunt';
  private pick: AutoPlayPick | null = null;
  private settings: AutoPlaySettings = loadAutoPlaySettings();
  private outsideBound = false;

  constructor(private readonly deps: AutoPlayWindowDeps) {}

  get isOpen(): boolean {
    return this.deps.root().style.display === 'block';
  }

  open(): void {
    this.settings = loadAutoPlaySettings();
    this.pick = null;
    this.lastSig = '';
    this.render();
    this.armOutside();
  }

  close(): void {
    this.pick = null;
    this.lastSig = '';
    const el = this.deps.root();
    el.style.display = 'none';
    el.innerHTML = '';
    this.disarmOutside();
  }

  relocalize(): void {
    if (!this.isOpen) return;
    this.lastSig = '';
    this.render();
  }

  private running(): boolean {
    return this.deps.isRunning();
  }

  private persist(next: AutoPlaySettings): void {
    this.settings = next;
    saveAutoPlaySettings(next);
    this.render();
  }

  private render(): void {
    const view = buildAutoPlayView({
      settings: this.settings,
      tab: this.tab,
      running: this.running(),
      walkByAutoloot: this.deps.walkByAutoloot(),
      pick: this.pick,
      knownIds: this.deps.knownIds(),
    });
    const sig = autoPlayViewSignature(view);
    const el = this.deps.root();
    if (sig === this.lastSig && el.style.display === 'block') return;
    this.lastSig = sig;
    el.innerHTML = this.markup(view);
    markDialogRoot(el, { labelledBy: 'pt-auto-play-title', modal: true });
    el.style.display = 'block';
    this.bindPainted(el);
  }

  private markup(view: ReturnType<typeof buildAutoPlayView>): string {
    const huntOn = view.tab === 'hunt' ? ' is-on' : '';
    const lootOn = view.tab === 'loot' ? ' is-on' : '';
    const body = view.tab === 'loot' ? this.lootMarkup(view) : this.huntMarkup(view);
    const runKey = view.running ? 'hudChrome.autoPlay.running' : 'hudChrome.autoPlay.stopped';
    const botKey = view.running ? 'hudChrome.autoPlay.stopBot' : 'hudChrome.autoPlay.startBot';
    return (
      `<div class="pt-ap-head">` +
      `<h2 id="pt-auto-play-title" class="pt-ap-title">${esc(t('hudChrome.autoPlay.title'))}</h2>` +
      `<button type="button" class="pt-ap-close" data-ap-close aria-label="${esc(t('hudChrome.autoPlay.close'))}">` +
      `${esc(t('hudChrome.autoPlay.close'))}</button>` +
      `</div>` +
      `<div class="pt-ap-tabs" role="tablist">` +
      `<button type="button" class="pt-ap-tab${huntOn}" data-ap-tab="hunt" role="tab">${esc(t('hudChrome.autoPlay.hunt'))}</button>` +
      `<button type="button" class="pt-ap-tab${lootOn}" data-ap-tab="loot" role="tab">${esc(t('hudChrome.autoPlay.loot'))}</button>` +
      `</div>${body}` +
      `<div class="pt-ap-foot">` +
      `<span class="pt-ap-run">${esc(t(runKey))}</span>` +
      `<button type="button" class="pt-ap-bot" data-ap-toggle>${esc(t(botKey))}</button>` +
      `</div>`
    );
  }

  private huntMarkup(view: ReturnType<typeof buildAutoPlayView>): string {
    const pick = view.pick
      ? `<div class="pt-ap-pick"><p class="pt-ap-pick-title">${esc(t('hudChrome.autoPlay.pickSkill'))}</p>` +
        `<ul class="pt-ap-pick-list">${view.pickRows.map((id) => this.pickRow(id)).join('')}</ul>` +
        `<button type="button" class="pt-ap-clear-slot" data-ap-clear-slot>${esc(t('hudChrome.mouseSkills.clearSlot'))}</button></div>`
      : '';
    return (
      `<div class="pt-ap-body">` +
      `<section class="pt-ap-col">` +
      `<h3 class="pt-ap-h">${esc(t('hudChrome.autoPlay.behavior'))}</h3>` +
      this.modeRow(view.mode) +
      this.toggleRow('prioritizeBoss', view.prioritizeBoss, 'hudChrome.autoPlay.prioritizeBoss') +
      this.leashRow(view.leashYd) +
      `<h3 class="pt-ap-h">${esc(t('hudChrome.autoPlay.recovery'))}</h3>` +
      this.toggleRow('autoHp', view.autoHp, 'hudChrome.autoPlay.autoHp') +
      this.sliderRow('hpBelow', view.hpBelow, 'hudChrome.autoPlay.hpBelow') +
      this.toggleRow('autoMp', view.autoMp, 'hudChrome.autoPlay.autoMp') +
      this.sliderRow('mpBelow', view.mpBelow, 'hudChrome.autoPlay.mpBelow') +
      this.toggleRow('autoStm', view.autoStm, 'hudChrome.autoPlay.autoStm') +
      this.sliderRow('stmBelow', view.stmBelow, 'hudChrome.autoPlay.stmBelow') +
      `<h3 class="pt-ap-h">${esc(t('hudChrome.autoPlay.range'))}</h3>` +
      this.rangeRow(view.rangeYd) +
      `</section>` +
      `<section class="pt-ap-col">` +
      `<h3 class="pt-ap-h">${esc(t('hudChrome.autoPlay.support'))}</h3>` +
      this.slotRow('support', view.supportIds) +
      `<h3 class="pt-ap-h">${esc(t('hudChrome.autoPlay.attack'))}</h3>` +
      this.slotRow('attack', view.attackIds) +
      pick +
      `</section></div>`
    );
  }

  private lootMarkup(view: ReturnType<typeof buildAutoPlayView>): string {
    return (
      `<div class="pt-ap-body pt-ap-body-loot">` +
      this.toggleRow('walkByAutoloot', view.walkByAutoloot, 'hudChrome.options.walkByAutoloot') +
      `</div>`
    );
  }

  private modeRow(mode: AutoPlayMode): string {
    const wanderOn = mode === 'wander' ? ' is-on' : '';
    const stationaryOn = mode === 'stationary' ? ' is-on' : '';
    return (
      `<div class="pt-ap-mode" role="radiogroup" aria-label="${esc(t('hudChrome.autoPlay.behavior'))}">` +
      `<button type="button" class="pt-ap-mode-btn${wanderOn}" data-ap-mode="wander" role="radio" aria-checked="${mode === 'wander' ? 'true' : 'false'}">` +
      `${esc(t('hudChrome.autoPlay.modeWander'))}</button>` +
      `<button type="button" class="pt-ap-mode-btn${stationaryOn}" data-ap-mode="stationary" role="radio" aria-checked="${mode === 'stationary' ? 'true' : 'false'}">` +
      `${esc(t('hudChrome.autoPlay.modeStationary'))}</button>` +
      `</div>`
    );
  }

  private toggleRow(key: string, on: boolean, labelKey: TranslationKey): string {
    const pressed = on ? 'true' : 'false';
    const onClass = on ? ' is-on' : '';
    return (
      `<label class="pt-ap-toggle">` +
      `<span>${esc(t(labelKey))}</span>` +
      `<button type="button" class="pt-ap-switch${onClass}" data-ap-toggle-key="${esc(key)}" aria-pressed="${pressed}"></button>` +
      `</label>`
    );
  }

  private sliderRow(key: string, value: number, labelKey: TranslationKey): string {
    const pct = formatNumber(value, { useGrouping: false });
    return (
      `<label class="pt-ap-slider">` +
      `<span>${esc(t(labelKey))}</span>` +
      `<input type="range" min="5" max="95" step="1" value="${esc(String(value))}" data-ap-slider="${esc(key)}" />` +
      `<span class="pt-ap-pct">${esc(pct)}%</span>` +
      `</label>`
    );
  }

  private leashRow(value: number): string {
    const yd = formatNumber(value, { useGrouping: false });
    return (
      `<label class="pt-ap-slider">` +
      `<span>${esc(t('hudChrome.autoPlay.leash'))}</span>` +
      `<input type="range" min="5" max="40" step="1" value="${esc(String(value))}" data-ap-slider="leashYd" />` +
      `<span class="pt-ap-pct">${esc(t('hudChrome.autoPlay.yards', { n: yd }))}</span>` +
      `</label>`
    );
  }

  private rangeRow(value: number): string {
    const yd = formatNumber(value, { useGrouping: false });
    return (
      `<label class="pt-ap-slider">` +
      `<span>${esc(t('hudChrome.autoPlay.maxRange'))}</span>` +
      `<input type="range" min="1" max="40" step="1" value="${esc(String(value))}" data-ap-slider="rangeYd" />` +
      `<span class="pt-ap-pct">${esc(t('hudChrome.autoPlay.yards', { n: yd }))}</span>` +
      `</label>`
    );
  }

  private slotRow(group: AutoPlayGroup, ids: Array<string | null>): string {
    const cells: string[] = [];
    for (let i = 0; i < AUTO_PLAY_SLOT_COUNT; i++) {
      const id = ids[i];
      const picked = this.pick?.group === group && this.pick.index === i ? ' is-picked' : '';
      if (id) {
        const def = ABILITIES[id];
        const name = def ? abilityDisplayName(def) : id;
        const icon = iconDataUrl('ability', id, 32);
        cells.push(
          `<button type="button" class="pt-ap-slot${picked}" data-ap-slot="${esc(group)}" data-ap-index="${i}" title="${esc(name)}">` +
            `<span class="pt-ap-slot-icon" style="background-image:url('${esc(icon)}')"></span>` +
            `</button>`,
        );
      } else {
        cells.push(
          `<button type="button" class="pt-ap-slot pt-ap-slot-empty${picked}" data-ap-slot="${esc(group)}" data-ap-index="${i}">+</button>`,
        );
      }
    }
    return `<div class="pt-ap-slots">${cells.join('')}</div>`;
  }

  private pickRow(id: string): string {
    const def = ABILITIES[id];
    const name = def ? abilityDisplayName(def) : id;
    const icon = iconDataUrl('ability', id, 32);
    return (
      `<li><button type="button" class="pt-ap-pick-row" data-ap-pick-id="${esc(id)}">` +
      `<span class="pt-ap-slot-icon" style="background-image:url('${esc(icon)}')"></span>` +
      `<span>${esc(name)}</span></button></li>`
    );
  }

  private bindPainted(el: HTMLElement): void {
    el.querySelector('[data-ap-close]')?.addEventListener('click', () => {
      audio.click();
      this.close();
    });
    el.querySelectorAll<HTMLElement>('[data-ap-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.apTab;
        if (tab !== 'hunt' && tab !== 'loot') return;
        audio.click();
        this.tab = tab;
        this.pick = null;
        this.render();
      });
    });
    el.querySelector('[data-ap-toggle]')?.addEventListener('click', () => {
      audio.click();
      this.deps.onToggleAuto();
      this.lastSig = '';
      this.render();
    });
    el.querySelectorAll<HTMLElement>('[data-ap-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.apMode;
        if (mode !== 'wander' && mode !== 'stationary') return;
        audio.click();
        this.persist({ ...this.settings, mode });
      });
    });
    el.querySelectorAll<HTMLElement>('[data-ap-toggle-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.click();
        const key = btn.dataset.apToggleKey;
        if (key === 'walkByAutoloot') {
          this.deps.setWalkByAutoloot(!this.deps.walkByAutoloot());
          this.lastSig = '';
          this.render();
          return;
        }
        if (key === 'prioritizeBoss') {
          this.persist({ ...this.settings, prioritizeBoss: !this.settings.prioritizeBoss });
          return;
        }
        if (key === 'autoHp') {
          this.persist({ ...this.settings, autoHp: !this.settings.autoHp });
          return;
        }
        if (key === 'autoMp') {
          this.persist({ ...this.settings, autoMp: !this.settings.autoMp });
          return;
        }
        if (key === 'autoStm') {
          this.persist({ ...this.settings, autoStm: !this.settings.autoStm });
        }
      });
    });
    el.querySelectorAll<HTMLInputElement>('[data-ap-slider]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.apSlider;
        const n = Number(input.value);
        if (key === 'hpBelow') this.persist({ ...this.settings, hpBelow: clampPct(n) });
        else if (key === 'mpBelow') this.persist({ ...this.settings, mpBelow: clampPct(n) });
        else if (key === 'stmBelow') this.persist({ ...this.settings, stmBelow: clampPct(n) });
        else if (key === 'rangeYd') this.persist({ ...this.settings, rangeYd: clampRangeYd(n) });
        else if (key === 'leashYd') this.persist({ ...this.settings, leashYd: clampLeashYd(n) });
      });
    });
    el.querySelectorAll<HTMLElement>('[data-ap-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.dataset.apSlot;
        const index = Number(btn.dataset.apIndex);
        if (group !== 'support' && group !== 'attack') return;
        if (!Number.isInteger(index)) return;
        audio.click();
        this.pick = { group, index };
        this.render();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-ap-pick-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.apPickId;
        if (!id || !this.pick) return;
        audio.click();
        this.persist(setAutoPlaySlot(this.settings, this.pick.group, this.pick.index, id));
        this.pick = null;
        this.render();
      });
    });
    el.querySelector('[data-ap-clear-slot]')?.addEventListener('click', () => {
      if (!this.pick) return;
      audio.click();
      this.persist(setAutoPlaySlot(this.settings, this.pick.group, this.pick.index, null));
      this.pick = null;
      this.render();
    });
  }

  private onOutside = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (this.deps.root().contains(target)) return;
    const gear = document.getElementById('pt-auto-settings');
    if (gear?.contains(target)) return;
    this.close();
  };

  private armOutside(): void {
    if (this.outsideBound) return;
    this.outsideBound = true;
    document.addEventListener('pointerdown', this.onOutside, true);
  }

  private disarmOutside(): void {
    if (!this.outsideBound) return;
    this.outsideBound = false;
    document.removeEventListener('pointerdown', this.onOutside, true);
  }
}
