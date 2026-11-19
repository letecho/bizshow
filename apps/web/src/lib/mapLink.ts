const GOOGLE_MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * Google マップの検索 URL（Maps URLs API）を組み立てる。
 * 住所が無いときは地図で特定できないため null を返す（リンクを出さない）。
 */
export function googleMapsSearchUrl(name: string, address: string | null | undefined): string | null {
  const trimmedAddress = address?.trim();
  if (!trimmedAddress) return null;
  const query = [name.trim(), trimmedAddress].filter(Boolean).join(' ');
  return `${GOOGLE_MAPS_SEARCH}${encodeURIComponent(query)}`;
}
