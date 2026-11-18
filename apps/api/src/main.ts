import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { createPrismaServiceRepository } from './repositories/prismaServiceRepository';

const port = Number(process.env.PORT || 4000);
const prisma = new PrismaClient();
const app = createApp({ serviceRepository: createPrismaServiceRepository(prisma) });

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
