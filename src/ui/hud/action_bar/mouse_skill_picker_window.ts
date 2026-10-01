// Cold painter for the PT L/R mouse-skill picker. Rising-style overlay:
// title, skill count, assignable rows, clear. CSS owns the look; this module
// owns open/close, assign callbacks, and well binding. No layout reads.

import { audio } from '../../../game/audio';
import { ABILITIES } from '../../../sim/data';
import { abilityDisplayName } from '../../ability_display_name';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import { formatNumber, t } from '../../i18n';
import { iconDataUrl } from '../../icons';
import { AutoPlayWindow } from './auto_play_window';
import {
  buildMouseSkillPickerView,
  MOUSE_SKILL_ATTACK_ID,
  type MouseSkillAssigned,
  type MouseSkillWell,
  mouseSkillPickerSignature,
} from './mouse_skill_picker_view';

export { mouseWellActionIndex, mouseWellBarSlot } from './mouse_skill_picker_view';

export interface MouseSkillPickerDeps {
  root(): HTMLElement;
  autoPlayRoot(): HTMLElement;
  knownIds(): readonly string[];
  assigned(well: MouseSkillWell): MouseSkillAssigned;
  editAllowed(): boolean;
  walkByAutoloot(): boolean;
  setWalkByAutoloot(on: boolean): void;
  onAssignAbility(well: MouseSkillWell, abilityId: string): void;
  onClear(well: MouseSkillWell): void;
  isAutoRunning(): boolean;
  onToggleAuto(): void;
}

export class MouseSkillPickerWindow {
  private lastSig = '';
  private well: MouseSkillWell | null = null;
  private outsideBound = false;
  private readonly autoPlay: AutoPlayWindow;

  constructor(private readonly deps: MouseSkillPickerDeps) {
    this.autoPlay = new AutoPlayWindow({
      root: () => this.deps.autoPlayRoot(),
      knownIds: () => this.deps.knownIds(),
      walkByAutoloot: () => this.deps.walkByAutoloot(),
      setWalkByAutoloot: (on) => this.deps.setWalkByAutoloot(on),
      isRunning: () => this.deps.isAutoRunning(),
      onToggleAuto: () => this.deps.onToggleAuto(),
    });
  }

  get isOpen(): boolean {
    return this.deps.root().style.display === 'block';
  }

  /** Close the settings overlay first, then the L/R picker. */
  closeTop(): boolean {
    if (this.autoPlay.isOpen) {
      this.autoPlay.close();
      return true;
    }
    if (this.isOpen) {
      this.close();
      return true;
    }
    return false;
  }

  attach(
    leftBtn: HTMLElement | null,
    rightBtn: HTMLElement | null,
    autoBtn: HTMLElement | null,
  ): void {
    this.dockWell('pt-mouse-l', leftBtn);
    this.dockWell('pt-mouse-r', rightBtn);
    this.bindWell(leftBtn, 'left');
    this.bindWell(rightBtn, 'right');
    autoBtn?.addEventListener('click', () => {
      audio.click();
      this.deps.onToggleAuto();
    });
    document.getElementById('pt-auto-settings')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.click();
      if (this.autoPlay.isOpen) this.autoPlay.close();
      else this.autoPlay.open();
    });
  }

  /** Park L/R wells in the dedicated mouse cluster, off the numbered skill rows. */
  private dockWell(hostId: string, btn: HTMLElement | null): void {
    const host = document.getElementById(hostId);
    if (!host || !btn) return;
    host.appendChild(btn);
  }

  open(well: MouseSkillWell): void {
    if (!this.deps.editAllowed()) return;
    this.well = well;
    this.lastSig = '';
    this.render();
    this.armOutside();
  }

  close(): void {
    this.well = null;
    this.lastSig = '';
    const el = this.deps.root();
    el.style.display = 'none';
    el.innerHTML = '';
    el.removeAttribute('data-well');
    this.disarmOutside();
  }

  relocalize(): void {
    this.autoPlay.relocalize();
    if (!this.isOpen) return;
    this.lastSig = '';
    this.render();
  }

  private bindWell(btn: HTMLElement | null, well: MouseSkillWell): void {
    if (!btn) return;
    btn.addEventListener(
      'contextmenu',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.open(well);
      },
      true,
    );
    btn.addEventListener(
      'click',
      (e) => {
        if (!this.isWellEmpty(well)) return;
        e.preventDefault();
        e.stopPropagation();
        this.open(well);
      },
      true,
    );
  }

  private isWellEmpty(well: MouseSkillWell): boolean {
    return !this.deps.assigned(well).abilityId;
  }

  private render(): void {
    if (!this.well) {
      this.close();
      return;
    }
    const view = buildMouseSkillPickerView({
      well: this.well,
      knownIds: this.deps.knownIds(),
      assigned: this.deps.assigned(this.well),
    });
    const sig = mouseSkillPickerSignature(view);
    const el = this.deps.root();
    if (sig === this.lastSig && el.style.display === 'block') return;
    this.lastSig = sig;
    el.dataset.well = view.well;
    el.innerHTML = this.markup(view);
    markDialogRoot(el, { labelledBy: 'pt-mouse-skill-title', modal: true });
    el.style.display = 'block';
    this.bindPainted(el, view.well);
  }

  private markup(view: ReturnType<typeof buildMouseSkillPickerView>): string {
    const count = formatNumber(view.count, { useGrouping: false });
    const rows = view.empty
      ? `<p class="pt-msp-empty">${esc(t('hudChrome.mouseSkills.noActiveSkills'))}</p>`
      : `<ul class="pt-msp-list">${view.rows.map((row) => this.rowMarkup(row.id, row.selected)).join('')}</ul>`;
    return (
      `<div class="pt-msp-head">` +
      `<h2 id="pt-mouse-skill-title" class="pt-msp-title">${esc(t(view.titleKey))}</h2>` +
      `<span class="pt-msp-count">${esc(t('hudChrome.mouseSkills.skills', { count }))}</span>` +
      `</div>${rows}` +
      `<button type="button" class="pt-msp-clear" data-msp-clear>` +
      `${esc(t('hudChrome.mouseSkills.clearSlot'))}</button>`
    );
  }

  private rowMarkup(id: string, selected: boolean): string {
    const selectedClass = selected ? ' is-selected' : '';
    if (id === MOUSE_SKILL_ATTACK_ID) {
      return (
        `<li><button type="button" class="pt-msp-row${selectedClass}" data-msp-attack>` +
        `<span class="pt-msp-icon pt-msp-icon-attack" aria-hidden="true"></span>` +
        `<span class="pt-msp-name">${esc(t('abilityUi.actionBar.attackName'))}</span>` +
        `</button></li>`
      );
    }
    const def = ABILITIES[id];
    const name = def ? abilityDisplayName(def) : id;
    const icon = iconDataUrl('ability', id, 32);
    return (
      `<li><button type="button" class="pt-msp-row${selectedClass}" data-msp-id="${esc(id)}">` +
      `<span class="pt-msp-icon" style="background-image:url('${esc(icon)}')" aria-hidden="true"></span>` +
      `<span class="pt-msp-name">${esc(name)}</span>` +
      `</button></li>`
    );
  }

  private bindPainted(el: HTMLElement, well: MouseSkillWell): void {
    el.querySelector('[data-msp-clear]')?.addEventListener('click', () => {
      audio.click();
      this.deps.onClear(well);
      this.close();
    });
    el.querySelectorAll<HTMLElement>('[data-msp-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.mspId;
        if (!id) return;
        audio.click();
        this.deps.onAssignAbility(well, id);
        this.close();
      });
    });
  }

  private onOutside = (e: Event): void => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (this.deps.root().contains(target)) return;
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
