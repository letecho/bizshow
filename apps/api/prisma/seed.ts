import { PrismaClient } from '@prisma/client';
import { seed } from '../src/db/seed';

const prisma = new PrismaClient();

seed(prisma)
  .then((count) => console.log(`Seeded ${count} service listings`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
