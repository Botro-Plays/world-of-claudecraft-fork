// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoPlayWindow } from '../src/ui/hud/action_bar/auto_play_window';

vi.mock('../src/game/audio', () => ({ audio: { click: vi.fn() } }));

function makeWindow(root: HTMLElement): AutoPlayWindow {
  return new AutoPlayWindow({
    root: () => root,
    knownIds: () => ['fireball'],
    walkByAutoloot: () => false,
    setWalkByAutoloot: () => undefined,
    isRunning: () => false,
    onToggleAuto: () => undefined,
  });
}

describe('AutoPlayWindow', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('opens the hunt tab with ToA behavior controls and closes from the close control', () => {
    const root = document.createElement('div');
    root.id = 'pt-auto-play';
    root.style.display = 'none';
    document.body.append(root);
    const win = makeWindow(root);
    win.open();
    expect(win.isOpen).toBe(true);
    expect(root.style.display).toBe('block');
    expect(root.querySelector('#pt-auto-play-title')?.textContent).toBeTruthy();
    expect(root.querySelector('[data-ap-tab="hunt"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-mode="wander"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-mode="stationary"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-toggle-key="prioritizeBoss"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-toggle-key="autoHp"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-toggle-key="autoMp"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-toggle-key="autoStm"]')).toBeTruthy();
    expect(root.querySelector('[data-ap-slider="leashYd"]')).toBeTruthy();
    root.querySelector<HTMLButtonElement>('[data-ap-close]')?.click();
    expect(win.isOpen).toBe(false);
  });

  it('switches to Wander mode from the behavior row', () => {
    const root = document.createElement('div');
    root.id = 'pt-auto-play';
    root.style.display = 'none';
    document.body.append(root);
    const win = makeWindow(root);
    win.open();
    root.querySelector<HTMLButtonElement>('[data-ap-mode="wander"]')?.click();
    expect(root.querySelector('[data-ap-mode="wander"]')?.classList.contains('is-on')).toBe(true);
    expect(root.querySelector('[data-ap-mode="stationary"]')?.classList.contains('is-on')).toBe(
      false,
    );
  });
});
