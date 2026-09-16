import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobsService } from './jobs.service.js';
import { PrismaService } from './prisma.service.js';

describe('JobsService', () => {
  let service: JobsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      job: {
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new JobsService(prismaMock as unknown as PrismaService);
  });

  describe('getAll', () => {
    it('returns all jobs when status is omitted', async () => {
      const mockJobs = [{ id: '1', title: 'Job 1', type: 'type', status: JobStatus.pending }];
      prismaMock.job.findMany.mockResolvedValue(mockJobs);

      const res = await service.getAll();
      expect(res).toEqual(mockJobs);
      expect(prismaMock.job.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters by status when valid status provided', async () => {
      prismaMock.job.findMany.mockResolvedValue([]);
      await service.getAll('pending');
      expect(prismaMock.job.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws BadRequestException for invalid status filter', () => {
      expect(() => service.getAll('not-valid')).toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('creates job with initial status pending', async () => {
      const created = { id: '1', title: 'New Job', type: 'report', status: JobStatus.pending };
      prismaMock.job.create.mockResolvedValue(created);

      const res = await service.create('New Job', 'report');
      expect(res).toEqual(created);
      expect(prismaMock.job.create).toHaveBeenCalledWith({
        data: { title: 'New Job', type: 'report', status: JobStatus.pending },
      });
    });
  });

  describe('updateStatus', () => {
    it('rejects transition to pending', async () => {
      await expect(service.updateStatus('1', JobStatus.pending)).rejects.toThrow(BadRequestException);
    });

    it('successfully transitions from pending to running', async () => {
      prismaMock.job.updateMany.mockResolvedValue({ count: 1 });
      const updatedJob = { id: '1', status: JobStatus.running };
      prismaMock.job.findUnique.mockResolvedValue(updatedJob);

      const res = await service.updateStatus('1', JobStatus.running);
      expect(res).toEqual(updatedJob);
      expect(prismaMock.job.updateMany).toHaveBeenCalledWith({
        where: { id: '1', status: 'pending' },
        data: { status: JobStatus.running },
      });
    });

    it('throws NotFoundException if job does not exist', async () => {
      prismaMock.job.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.job.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('999', JobStatus.running)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if job was already updated by another request', async () => {
      prismaMock.job.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.job.findUnique.mockResolvedValue({ id: '1', status: JobStatus.running });

      await expect(service.updateStatus('1', JobStatus.running)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for illegal transition (e.g. pending to completed)', async () => {
      prismaMock.job.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.job.findUnique.mockResolvedValue({ id: '1', status: JobStatus.pending });

      await expect(service.updateStatus('1', JobStatus.completed)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes job when it exists', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: '1' });
      prismaMock.job.delete.mockResolvedValue({ id: '1' });

      await service.remove('1');
      expect(prismaMock.job.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('throws NotFoundException when job to delete does not exist', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);
      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });
});
