import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchServices, toQueryString } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('toQueryString', () => {
  it('passes search params through and takes the first value of arrays', () => {
    expect(toQueryString({ q: 'clinic', category: 'medical', lang: ['vi', 'en'], prefecture: undefined })).toBe(
      'q=clinic&category=medical&lang=vi',
    );
  });
});

describe('searchServices', () => {
  it('returns ok:false instead of throwing when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(searchServices('')).resolves.toEqual({ ok: false, status: null });
  });

  it('returns ok:false with the status on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(searchServices('limit=100')).resolves.toEqual({ ok: false, status: 400 });
  });

  it('returns the parsed body on success', async () => {
    const body = { data: [], meta: { page: 1, limit: 20, total: 0 } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchServices('category=legal')).resolves.toEqual({ ok: true, value: body });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/services\?category=legal$/);
  });
});
