import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import type { ServiceDetail } from '@fss/shared/domain';

const service: ServiceDetail = {
  id: 'svc1',
  slug: 'tokyo-legal',
  category: 'legal',
  prefecture: 'tokyo',
  city: null,
  supportedLanguages: ['ja', 'en'],
  name: { en: 'Tokyo Legal Desk', ja: '東京法律相談' },
  description: { en: 'Visa consultations.' },
  address: null,
  phone: null,
  websiteUrl: null,
  imageUrl: 'https://cdn.example.com/uploads/a.jpg',
} as unknown as ServiceDetail;

vi.mock('../../../../lib/api', () => ({
  getService: vi.fn(async () => ({ ok: true, value: { data: service } })),
}));

const { default: ServiceDetailPage } = await import('./page');

type ImgProps = { src?: string; alt?: string };

/** ページが返す要素ツリーから img 要素の props を集める（ページは組み込み要素のみで構成） */
function findImages(node: ReactNode): ImgProps[] {
  if (Array.isArray(node)) return node.flatMap(findImages);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const self = node.type === 'img' ? [node.props as ImgProps] : [];
  return [...self, ...findImages(node.props.children)];
}

async function images(locale: string) {
  const element = await ServiceDetailPage({ params: Promise.resolve({ locale, slug: service.slug }) });
  return findImages(element);
}

describe('ServiceDetailPage image (B-006)', () => {
  it('sets the localized service name as the alt text of the listing image', async () => {
    expect(await images('ja')).toEqual([{ src: 'https://cdn.example.com/uploads/a.jpg', alt: '東京法律相談', className: expect.anything() }]);
    // 名前が未翻訳の言語は en にフォールバック
    expect((await images('vi'))[0].alt).toBe('Tokyo Legal Desk');
  });
});

type AnchorProps = { href?: string; target?: string; rel?: string; children?: ReactNode };

function findAnchors(node: ReactNode): AnchorProps[] {
  if (Array.isArray(node)) return node.flatMap(findAnchors);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const self = node.type === 'a' ? [node.props as AnchorProps] : [];
  return [...self, ...findAnchors(node.props.children)];
}

async function mapLinks(locale: string) {
  const element = await ServiceDetailPage({ params: Promise.resolve({ locale, slug: service.slug }) });
  return findAnchors(element).filter((a) => a.href?.startsWith('https://www.google.com/maps/'));
}

describe('ServiceDetailPage Google Maps link (F-110)', () => {
  it('shows no map link when the listing has no address', async () => {
    expect(await mapLinks('ja')).toEqual([]);
  });

  it('links to a Google Maps search for the localized name and address in a new tab', async () => {
    Object.assign(service, { address: { ja: '東京都千代田区丸の内1-1', en: '1-1 Marunouchi, Chiyoda-ku, Tokyo' } });
    try {
      const [ja] = await mapLinks('ja');
      expect(ja.href).toBe(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('東京法律相談 東京都千代田区丸の内1-1')}`,
      );
      expect(ja.target).toBe('_blank');
      expect(ja.rel).toBe('noopener noreferrer');
      expect(ja.children).toBe('Google マップで開く（新しいタブ）');
      // 未翻訳の言語は名前・住所とも en にフォールバック
      const [vi] = await mapLinks('vi');
      expect(vi.href).toBe(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Tokyo Legal Desk 1-1 Marunouchi, Chiyoda-ku, Tokyo')}`,
      );
      expect(vi.children).toBe('Mở trong Google Maps (tab mới)');
    } finally {
      Object.assign(service, { address: null });
    }
  });
});
