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
