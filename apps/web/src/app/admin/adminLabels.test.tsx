import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

// B-008: 管理画面の入力欄すべてにアクセシブルな名前（WCAG 2.2 SC 1.3.1 / 4.1.2）
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // ImageField を関数として呼んで要素ツリーを得るため、useState は初期値を返すだけにする
  return { ...actual, useState: <T,>(init: T) => [init, () => {}] };
});
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../../lib/adminApi', () => ({
  adminFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [], meta: { total: 0 } }) })),
}));
vi.mock('./actions', () => ({ setPublished: vi.fn(), createUploadTicket: vi.fn() }));

const { default: AdminServicesPage } = await import('./page');
const { ImageField } = await import('../../components/admin/ImageField');

type ControlProps = { name?: string; type?: string; 'aria-label'?: string; 'aria-labelledby'?: string; children?: ReactNode };

/** 要素ツリー（組み込み要素のみ）から、label の外にあり aria-label も無い入力欄を集める */
function unlabeledControls(node: ReactNode, insideLabel = false): string[] {
  if (Array.isArray(node)) return node.flatMap((n) => unlabeledControls(n, insideLabel));
  if (!isValidElement<ControlProps>(node)) return [];
  const { type } = node;
  const props = node.props;
  const isControl = type === 'input' || type === 'select' || type === 'textarea';
  const self =
    isControl && props.type !== 'hidden' && !insideLabel && !props['aria-label'] && !props['aria-labelledby']
      ? [`${String(type)}[name=${props.name ?? ''}][type=${props.type ?? ''}]`]
      : [];
  return [...self, ...unlabeledControls(props.children, insideLabel || type === 'label')];
}

describe('admin form controls have accessible names (B-008)', () => {
  it('services list filters (q, published)', async () => {
    const element = await AdminServicesPage({ searchParams: Promise.resolve({}) });
    expect(unlabeledControls(element)).toEqual([]);
  });

  it('image file input', () => {
    expect(unlabeledControls(ImageField({}))).toEqual([]);
  });
});
