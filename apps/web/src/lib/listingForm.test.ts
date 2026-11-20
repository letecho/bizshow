import { describe, it, expect } from 'vitest';
import { ListingRequestInputSchema } from '@fss/shared/domain';
import { listingFormToInput } from './listingForm';

function formData(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe('listingFormToInput', () => {
  it('builds a valid listing request from form fields', () => {
    const input = listingFormToInput(
      formData([
        ['categories', 'work'],
        ['categories', 'legal'],
        ['prefecture', 'tokyo'],
        ['city', ''],
        ['supportedLanguages', 'ja'],
        ['supportedLanguages', 'vi'],
        ['name_en', 'Clinic'],
        ['name_vi', 'Phòng khám'],
        ['name_ja', ''],
        ['description_en', 'General clinic'],
        ['address_en', ''],
        ['phone', ''],
        ['websiteUrl', ''],
        ['contactName', 'Suzuki'],
        ['contactEmail', 'suzuki@example.com'],
      ]),
    );
    expect(input.address).toBeUndefined();
    const parsed = ListingRequestInputSchema.parse(input);
    expect(parsed).toMatchObject({
      categories: ['work', 'legal'],
      supportedLanguages: ['ja', 'vi'],
      name: { en: 'Clinic', vi: 'Phòng khám' },
      contactEmail: 'suzuki@example.com',
    });
    expect(parsed.city).toBeUndefined();
  });

  it('fails validation when the English name is missing', () => {
    const input = listingFormToInput(formData([['name_ja', 'クリニック']]));
    expect(ListingRequestInputSchema.safeParse(input).success).toBe(false);
  });
});
