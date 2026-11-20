import { expect, test } from '@playwright/test';

// シードデータ（apps/api/src/db/seedData.ts: 8カテゴリ×3件=24件）が前提
test('top → filter by category → service detail', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Multilingual Service Finder in Japan');
  await expect(page.getByText('24 results')).toBeVisible();

  await page.getByLabel('Category').selectOption('legal');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/[?&]category=legal/);
  await expect(page.getByText('3 results')).toBeVisible();

  const card = page.locator('article').first();
  const name = (await card.getByRole('heading').textContent())?.trim();
  expect(name).toBeTruthy();
  await card.getByRole('link', { name: 'View details' }).click();

  await expect(page).toHaveURL(/\/en\/services\/legal-/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!);
  await expect(page.getByText('Legal & Visa')).toBeVisible();
});

// B-005: /[locale] 配下の 404 でも html lang がロケールと一致し、文言がその言語で表示される
for (const path of ['/ja/services/not-exist', '/ja/legal/not-exist', '/ja/no-such-page']) {
  test(`404 is localized: ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ページが見つかりません');
    await expect(page.getByRole('link', { name: '検索に戻る' })).toHaveAttribute('href', '/ja');
    // B-007: タイトルでも 404 であることが分かる
    await expect(page).toHaveTitle('ページが見つかりません | 在日外国人向けサービス検索');
  });
}

// F-121: カテゴリ名は API（Category テーブル）から表示言語で出る。申請フォームはチェックボックスで複数選択
test('category names come from the API in vi, and the apply form has a category checkbox group', async ({ page }) => {
  await page.goto('/vi?category=legal');
  await expect(page.getByLabel('Danh mục')).toHaveValue('legal');
  await expect(page.locator('article').first()).toContainText('Pháp lý & Visa');

  await page.goto('/ja/apply');
  const group = page.getByRole('group', { name: 'カテゴリ *' });
  await expect(group.getByRole('checkbox')).toHaveCount(8);
  await expect(group.getByRole('checkbox', { name: '法律・ビザ' })).toBeVisible();
});
