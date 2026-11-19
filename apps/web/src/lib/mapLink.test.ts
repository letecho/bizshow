import { describe, it, expect } from 'vitest';
import { googleMapsSearchUrl } from './mapLink';

describe('googleMapsSearchUrl (F-110)', () => {
  it('builds a Google Maps search URL from the name and address', () => {
    expect(googleMapsSearchUrl('Tokyo Legal Desk', '1-1 Marunouchi, Chiyoda-ku')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Tokyo%20Legal%20Desk%201-1%20Marunouchi%2C%20Chiyoda-ku',
    );
  });

  it('percent-encodes non-ASCII and reserved characters', () => {
    const url = googleMapsSearchUrl('東京法律相談 & 行政書士', '東京都千代田区丸の内1-1 #2F')!;
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    const query = url.slice('https://www.google.com/maps/search/?api=1&query='.length);
    expect(query).not.toMatch(/[&#\s]/);
    expect(decodeURIComponent(query)).toBe('東京法律相談 & 行政書士 東京都千代田区丸の内1-1 #2F');
  });

  it('returns null when there is no address', () => {
    expect(googleMapsSearchUrl('Tokyo Legal Desk', null)).toBeNull();
    expect(googleMapsSearchUrl('Tokyo Legal Desk', undefined)).toBeNull();
    expect(googleMapsSearchUrl('Tokyo Legal Desk', '   ')).toBeNull();
  });
});
