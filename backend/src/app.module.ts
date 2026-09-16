import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { JobsService } from './jobs.service.js';
import { JobsController } from './jobs.controller.js';

@Module({
  providers: [PrismaService, JobsService],
  controllers: [JobsController],
})
export class AppModule {}
