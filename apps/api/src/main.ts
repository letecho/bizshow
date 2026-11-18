import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { createMailerFromEnv } from './mail/mailer';
import { createAuthOptionsFromEnv } from './middleware/auth';
import { createPrismaInquiryRepository } from './repositories/prismaInquiryRepository';
import { createPrismaListingRequestRepository } from './repositories/prismaListingRequestRepository';
import { createPrismaServiceRepository } from './repositories/prismaServiceRepository';
import { createStorageFromEnv } from './storage/storage';

const port = Number(process.env.PORT || 4000);
const prisma = new PrismaClient();

async function main() {
  const { storage, local } = createStorageFromEnv();
  const app = createApp({
    serviceRepository: createPrismaServiceRepository(prisma),
    inquiryRepository: createPrismaInquiryRepository(prisma),
    listingRequestRepository: createPrismaListingRequestRepository(prisma),
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
