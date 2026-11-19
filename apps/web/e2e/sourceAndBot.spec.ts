import { expect, test } from '@playwright/test';

// F-116: ボット説明ページ（3 言語）と、掲載詳細 → 修正・削除の依頼（お問い合わせに件名と slug が入る）
const BOT_HEADINGS = {
  ja: 'クローラーについて',
  en: 'About our crawler',
  vi: 'Về trình thu thập dữ liệu của chúng tôi',
} as const;

for (const [locale, heading] of Object.entries(BOT_HEADINGS)) {
  test(`bot page is available in ${locale}`, async ({ page }) => {
    const res = await page.goto(`/${locale}/bot`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByText('bizshow-collector/0.1')).toBeVisible();
    await expect(page.locator(`article a[href="/${locale}/contact"]`)).toBeVisible();
  });
}

// F-120: 廃止した中国語のページは英語ページへ恒久リダイレクト
test('/zh pages redirect to English', async ({ page }) => {
  const res = await page.goto('/zh/bot');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/bot$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('a[hreflang="zh"], link[hreflang="zh"]')).toHaveCount(0);
});

test('detail → request a correction prefills the contact form with the subject and slug', async ({ page }) => {
  await page.goto('/ja?category=legal');
  await page.locator('article').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/ja\/services\/legal-/);
  const slug = new URL(page.url()).pathname.split('/').pop()!;

  await page.getByRole('link', { name: '掲載情報の修正・削除を依頼' }).click();
  await expect(page).toHaveURL(`/ja/contact?topic=listing&slug=${slug}`);
  await expect(page.getByLabel('お問い合わせ内容')).toHaveValue(`【掲載情報の修正・削除の依頼】\nslug: ${slug}\n\n`);
});
