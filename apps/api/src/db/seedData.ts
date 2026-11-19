import {
  PREFECTURES,
  SERVICE_CATEGORIES,
  type LocalizedText,
  type PrefectureCode,
  type ServiceCategory,
  type SupportedLocale,
} from '@fss/shared';
import { buildSearchText } from './searchText';

/** デモ用シードデータ（架空の事業者。電話番号・URLはダミー） */
export interface SeedListing {
  slug: string;
  category: ServiceCategory;
  prefecture: PrefectureCode;
  supportedLanguages: SupportedLocale[];
  name: LocalizedText;
  description: LocalizedText;
  address: LocalizedText;
  phone: string;
  websiteUrl: string;
  searchText: string;
}

const SEED_PREFECTURES: { code: PrefectureCode; vi: string }[] = [
  { code: 'tokyo', vi: 'Tokyo' },
  { code: 'osaka', vi: 'Osaka' },
  { code: 'saitama', vi: 'Saitama' },
  { code: 'aichi', vi: 'Aichi' },
  { code: 'fukuoka', vi: 'Fukuoka' },
];

const LANGUAGE_SETS: SupportedLocale[][] = [
  ['ja', 'en', 'vi'],
  ['ja', 'en'],
  ['ja', 'en', 'vi'],
  ['ja', 'en'],
];

type Template = { name: Required<LocalizedText>; description: Required<LocalizedText> };

const TEMPLATES: Record<ServiceCategory, Template> = {
  medical: {
    name: { ja: '多言語クリニック', en: 'Multilingual Clinic', vi: 'Phòng khám đa ngôn ngữ' },
    description: {
      ja: '内科・小児科。外国語対応スタッフが受付から診察まで案内します。',
      en: 'Internal medicine and pediatrics. Multilingual staff support you from reception to consultation.',
      vi: 'Nội khoa và nhi khoa. Nhân viên đa ngôn ngữ hỗ trợ từ quầy tiếp nhận đến khi khám.',
    },
  },
  legal: {
    name: { ja: '在留資格・ビザ相談センター', en: 'Visa & Residence Support Center', vi: 'Trung tâm tư vấn visa và tư cách lưu trú' },
    description: {
      ja: '行政書士による在留資格の申請・更新・変更の相談。',
      en: 'Consultation on applying for, renewing and changing residence status with licensed administrative scriveners.',
      vi: 'Tư vấn xin cấp, gia hạn và thay đổi tư cách lưu trú bởi chuyên viên hành chính.',
    },
  },
  housing: {
    name: { ja: '外国人歓迎不動産', en: 'Foreigner-Friendly Real Estate', vi: 'Bất động sản thân thiện với người nước ngoài' },
    description: {
      ja: '保証人なし・外国語での契約説明に対応した賃貸物件を紹介します。',
      en: 'Rental apartments with no guarantor required and contract explanations in your language.',
      vi: 'Giới thiệu nhà cho thuê không cần người bảo lãnh, giải thích hợp đồng bằng tiếng của bạn.',
    },
  },
  telecom: {
    name: { ja: 'スマホ・SIM相談窓口', en: 'Mobile & SIM Help Desk', vi: 'Quầy tư vấn điện thoại và SIM' },
    description: {
      ja: '在留カードで契約できるSIM・スマホプランを多言語で案内。',
      en: 'Multilingual guidance on SIM and smartphone plans you can sign up for with a residence card.',
      vi: 'Hướng dẫn đa ngôn ngữ về gói SIM và điện thoại có thể đăng ký bằng thẻ cư trú.',
    },
  },
  finance: {
    name: { ja: '外国人向け銀行口座サポート', en: 'Bank Account Support for Foreign Residents', vi: 'Hỗ trợ mở tài khoản ngân hàng cho người nước ngoài' },
    description: {
      ja: '口座開設・海外送金の手続きを外国語でサポートします。',
      en: 'Help with opening a bank account and sending money overseas in your language.',
      vi: 'Hỗ trợ mở tài khoản và chuyển tiền ra nước ngoài bằng tiếng của bạn.',
    },
  },
  education: {
    name: { ja: '日本語教室', en: 'Japanese Language School', vi: 'Lớp học tiếng Nhật' },
    description: {
      ja: '初級から上級まで。仕事や生活に役立つ日本語を学べます。',
      en: 'Beginner to advanced classes. Learn Japanese useful for work and daily life.',
      vi: 'Từ sơ cấp đến cao cấp. Học tiếng Nhật hữu ích cho công việc và cuộc sống.',
    },
  },
  work: {
    name: { ja: '外国人就労支援センター', en: 'Employment Support Center for Foreign Residents', vi: 'Trung tâm hỗ trợ việc làm cho người nước ngoài' },
    description: {
      ja: '求人紹介・履歴書作成・面接練習を多言語でサポート。',
      en: 'Job listings, resume writing and interview practice with multilingual support.',
      vi: 'Giới thiệu việc làm, viết sơ yếu lý lịch và luyện phỏng vấn với hỗ trợ đa ngôn ngữ.',
    },
  },
  daily: {
    name: { ja: '外国人生活相談窓口', en: 'Daily Life Consultation Desk', vi: 'Quầy tư vấn đời sống cho người nước ngoài' },
    description: {
      ja: 'ごみの出し方、役所の手続き、子育てなど生活全般の相談。',
      en: 'Advice on everyday matters such as garbage sorting, city hall procedures and child-rearing.',
      vi: 'Tư vấn mọi vấn đề đời sống như phân loại rác, thủ tục hành chính và nuôi dạy con.',
    },
  },
};

const LISTINGS_PER_CATEGORY = 3;

function buildSeedListings(): SeedListing[] {
  return SERVICE_CATEGORIES.flatMap((category, c) =>
    Array.from({ length: LISTINGS_PER_CATEGORY }, (_, k) => {
      const i = c * LISTINGS_PER_CATEGORY + k;
      const pref = SEED_PREFECTURES[i % SEED_PREFECTURES.length];
      const prefName = PREFECTURES.find((p) => p.code === pref.code)!;
      const { name: n, description } = TEMPLATES[category];
      const name: LocalizedText = {
        ja: `${prefName.ja.replace(/[都府県]$/, '')} ${n.ja}`,
        en: `${prefName.en} ${n.en}`,
        vi: `${n.vi} ${pref.vi}`,
      };
      return {
        slug: `${category}-${pref.code}`,
        category,
        prefecture: pref.code,
        supportedLanguages: LANGUAGE_SETS[i % LANGUAGE_SETS.length],
        name,
        description,
        address: { ja: prefName.ja, en: `${prefName.en}, Japan` },
        phone: `0120-000-${String(i + 1).padStart(3, '0')}`,
        websiteUrl: `https://example.com/${category}-${pref.code}`,
        searchText: buildSearchText(name, description),
      };
    }),
  );
}

export const SEED_LISTINGS: SeedListing[] = buildSeedListings();
