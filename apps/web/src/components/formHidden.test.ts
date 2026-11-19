import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// B-016: 掲載フォームの言語タブで hidden の tabpanel（.form）が display:flex のまま表示されていた。
// display を指定するクラスは hidden 属性で非表示にできること（[hidden] の display:none を上書きしない）
const css = readFileSync(fileURLToPath(new URL('./Form.module.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** 単一クラスのルールのうち display: none 以外を指定するクラス名 */
function classesWithDisplay(source: string): string[] {
  return [...source.matchAll(/(^|\})\s*\.([\w-]+)\s*\{([^}]*)\}/g)]
    .filter(([, , , body]) => /(^|;|\s)display\s*:\s*(?!none)/.test(body))
    .map(([, , name]) => name);
}

function hasHiddenRule(source: string, name: string): boolean {
  return [...source.matchAll(/([^{}]+)\{([^}]*)\}/g)].some(
    ([, selector, body]) =>
      selector.split(',').some((s) => s.trim() === `.${name}[hidden]`) && /display\s*:\s*none/.test(body),
  );
}

describe('Form.module.css hidden support (B-016)', () => {
  it('finds the classes that set display (including .form used for tab panels)', () => {
    expect(classesWithDisplay(css)).toContain('form');
  });

  it.each(classesWithDisplay(css))('.%s can be hidden with the hidden attribute', (name) => {
    expect(hasHiddenRule(css, name)).toBe(true);
  });
});
