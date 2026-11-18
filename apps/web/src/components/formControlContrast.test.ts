import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// B-012 / 品質管理票 Q-063: 入力欄の枠線は隣接する背景（白）と 3:1 以上（WCAG 2.2 SC 1.4.11）
const CSS_FILES = ['Form.module.css', 'SearchForm.module.css'];
const PAGE_BACKGROUND = '#ffffff';

function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** input/select/textarea を対象にするルールの border 色を集める */
function controlBorderColors(css: string): string[] {
  const colors: string[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/\b(input|select|textarea)\b/.test(selector)) continue;
    for (const [, color] of body.matchAll(/border(?:-color)?\s*:[^;]*?(#[0-9a-fA-F]{3,6})\b/g)) {
      colors.push(color);
    }
  }
  return colors;
}

describe('form control border contrast (WCAG 2.2 SC 1.4.11)', () => {
  for (const file of CSS_FILES) {
    it(`${file}: input/select/textarea borders have >= 3:1 contrast against the background`, () => {
      const css = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8');
      const colors = controlBorderColors(css);
      expect(colors.length).toBeGreaterThan(0);
      for (const color of colors) {
        expect(contrast(color, PAGE_BACKGROUND), `${file} border ${color}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
