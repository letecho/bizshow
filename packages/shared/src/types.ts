export type SupportedLocale = 'ja' | 'en' | 'zh' | 'vi';

export interface ServiceItem {
  id: string;
  title: Record<SupportedLocale, string>;
  category: 'medical' | 'legal' | 'housing' | 'telecom' | 'finance';
  prefecture: string;
  supportedLanguages: SupportedLocale[];
  description: Record<SupportedLocale, string>;
}
