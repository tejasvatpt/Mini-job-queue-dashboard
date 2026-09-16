import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

const REQUIRED_CURRENT: Partial<Record<JobStatus, JobStatus>> = {
  running: 'pending',
  completed: 'running',
  failed: 'running',
};

@Injectable()
export class JobsService {
  constructor(private db: PrismaService) {}

  getAll(status?: string) {
    if (status && !Object.values(JobStatus).includes(status as JobStatus)) {
      throw new BadRequestException(`Invalid status filter: "${status}"`);
    }
    return this.db.job.findMany({
      where: status ? { status: status as JobStatus } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(title: string, type: string) {
    return this.db.job.create({
      data: { title, type, status: JobStatus.pending },
    });
  }

  async updateStatus(id: string, next: JobStatus) {
    const from = REQUIRED_CURRENT[next];

    if (!from) {
      throw new BadRequestException(
        `Cannot transition to "${next}". Valid targets: running, completed, failed.`,
      );
    }

    const { count } = await this.db.job.updateMany({
      where: { id, status: from },
      data: { status: next },
    });

    if (count === 1) return this.db.job.findUnique({ where: { id } });

    const job = await this.db.job.findUnique({ where: { id } });

    if (!job) throw new NotFoundException(`Job "${id}" not found.`);
    if (job.status === next) throw new ConflictException('Job was already updated by another request.');
    throw new BadRequestException(
      `Cannot move job from "${job.status}" to "${next}". Allowed: pending→running, running→completed/failed.`,
    );
  }

  async remove(id: string) {
    const job = await this.db.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job "${id}" not found.`);
    await this.db.job.delete({ where: { id } });
  }
}
