import { PrismaClient } from '@prisma/client';
import { createAnthropicLlmClient, createBudgetedLlm, isLlmAvailable, loadLlmSettings } from '@fss/shared';
import { createApp } from './app';
import { createMailerFromEnv } from './mail/mailer';
import { createAuthOptionsFromEnv } from './middleware/auth';
import { createPrismaCategoryRepository } from './repositories/prismaCategoryRepository';
import { createPrismaCandidateRepository } from './repositories/prismaCandidateRepository';
import { createPrismaBlocklistRepository } from './repositories/prismaBlocklistRepository';
import { createPrismaLlmUsageStore } from './repositories/prismaLlmUsageStore';
import { createPrismaInquiryRepository } from './repositories/prismaInquiryRepository';
import { createPrismaListingRequestRepository } from './repositories/prismaListingRequestRepository';
import { createPrismaOutreachRepository } from './repositories/prismaOutreachRepository';
import { createPrismaServiceRepository } from './repositories/prismaServiceRepository';
import { createStorageFromEnv } from './storage/storage';

const port = Number(process.env.PORT || 4000);
const prisma = new PrismaClient();

async function main() {
  const { storage, local } = createStorageFromEnv();
  // 説明文の下書き（F-117）: 有効・予算 > 0・モデル・API キーが揃ったときだけ
  const llmSettings = loadLlmSettings(process.env);
  const llm = isLlmAvailable(llmSettings)
    ? createBudgetedLlm({
        client: createAnthropicLlmClient({ apiKey: llmSettings.apiKey, model: llmSettings.model }),
        store: createPrismaLlmUsageStore(prisma),
        settings: llmSettings,
      })
    : undefined;
  const app = createApp({
    serviceRepository: createPrismaServiceRepository(prisma),
    categoryRepository: createPrismaCategoryRepository(prisma),
    inquiryRepository: createPrismaInquiryRepository(prisma),
    listingRequestRepository: createPrismaListingRequestRepository(prisma),
    blocklistRepository: createPrismaBlocklistRepository(prisma),
    candidateRepository: createPrismaCandidateRepository(prisma),
    llm,
    outreachRepository: createPrismaOutreachRepository(prisma),
    mailer: createMailerFromEnv(),
    auth: await createAuthOptionsFromEnv(),
    storage,
    localUploads: local,
  });

  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
