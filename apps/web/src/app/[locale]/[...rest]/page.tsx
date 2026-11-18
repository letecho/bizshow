import { notFound } from 'next/navigation';

/** /[locale] 配下の未定義パスを [locale] レイアウトの 404（not-found.tsx）で表示する */
export default function CatchAllNotFound() {
  notFound();
}
