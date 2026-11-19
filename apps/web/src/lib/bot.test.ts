import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '@fss/shared/domain';
import { fillBotPlaceholders, loadBotDocument } from './bot';

describe('bot page content (F-116)', () => {
  it('has content in every locale in the repo, with the contact link of that locale', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const doc = await loadBotDocument(locale);
      expect(doc.locale).toBe(locale);
      expect(doc.markdown).toContain('bizshow-collector/0.1');
      expect(doc.markdown).toContain(`(/${locale}/contact)`);
      expect(doc.markdown).not.toContain('{{');
    }
  });

  it('replaces the contact URL placeholder', () => {
    expect(fillBotPlaceholders('[c]({{contactUrl}}) [d]({{contactUrl}})', 'zh')).toBe('[c](/zh/contact) [d](/zh/contact)');
  });
});
