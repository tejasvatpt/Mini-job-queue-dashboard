import { PrismaClient, JobStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  await prisma.job.deleteMany();

  const jobs = [
    { title: 'Generate monthly report', type: 'report', status: JobStatus.pending },
    { title: 'Send welcome emails', type: 'email', status: JobStatus.running },
    { title: 'Export user data to CSV', type: 'export', status: JobStatus.completed },
    { title: 'Sync inventory records', type: 'sync', status: JobStatus.failed },
    { title: 'Process payment batch', type: 'payment', status: JobStatus.pending },
  ];

  for (const job of jobs) {
    await prisma.job.create({ data: job });
  }

  console.log(`Seeded ${jobs.length} jobs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
