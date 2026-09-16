import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/http-exception.filter.js';
import { PrismaService } from '../src/prisma.service.js';

describe('Jobs API (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    server = app.getHttpServer();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.job.deleteMany();
    await app.close();
  });

  beforeEach(async () => {

    await prisma.job.deleteMany();
  });

  describe('POST /jobs', () => {
    it('creates a job and returns 201 with status=pending', async () => {
      const res = await request(server)
        .post('/jobs')
        .send({ title: 'Generate report', type: 'report' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'Generate report',
        type: 'report',
        status: 'pending',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('returns 400 when title is missing', async () => {
      await request(server)
        .post('/jobs')
        .send({ type: 'report' })
        .expect(400);
    });

    it('returns 400 when type is missing', async () => {
      await request(server)
        .post('/jobs')
        .send({ title: 'Test Job' })
        .expect(400);
    });

    it('returns 400 when title is empty string', async () => {
      await request(server)
        .post('/jobs')
        .send({ title: '', type: 'report' })
        .expect(400);
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      await request(server)
        .post('/jobs')
        .send({ title: 'a'.repeat(201), type: 'report' })
        .expect(400);
    });

    it('returns 400 when unknown fields are provided', async () => {
      await request(server)
        .post('/jobs')
        .send({ title: 'Test', type: 'report', status: 'pending' })
        .expect(400);
    });

    it('ignores attempts to set status via extra field (whitelist rejects it)', async () => {

      await request(server)
        .post('/jobs')
        .send({ title: 'Test', type: 'report', status: 'running' })
        .expect(400);
    });
  });

  describe('GET /jobs', () => {
    it('returns all jobs sorted by createdAt desc', async () => {
      await prisma.job.create({ data: { title: 'Job 1', type: 'type-a', status: 'pending' } });

      await new Promise((r) => setTimeout(r, 10));
      await prisma.job.create({ data: { title: 'Job 2', type: 'type-b', status: 'running' } });

      const res = await request(server).get('/jobs').expect(200);

      expect(res.body).toHaveLength(2);

      expect(res.body[0].title).toBe('Job 2');
      expect(res.body[1].title).toBe('Job 1');
    });

    it('returns empty array when no jobs exist', async () => {
      const res = await request(server).get('/jobs').expect(200);
      expect(res.body).toEqual([]);
    });

    it('filters by valid status', async () => {
      await prisma.job.create({ data: { title: 'Pending Job', type: 'a', status: 'pending' } });
      await prisma.job.create({ data: { title: 'Running Job', type: 'b', status: 'running' } });

      const res = await request(server).get('/jobs?status=pending').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('pending');
    });

    it('returns 400 for invalid status filter', async () => {
      await request(server).get('/jobs?status=invalid').expect(400);
    });
  });

  describe('PATCH /jobs/:id/status — valid transitions', () => {
    it('pending → running returns 200', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'pending' },
      });

      const res = await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'running' })
        .expect(200);

      expect(res.body.status).toBe('running');
    });

    it('running → completed returns 200', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'running' },
      });

      const res = await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'completed' })
        .expect(200);

      expect(res.body.status).toBe('completed');
    });

    it('running → failed returns 200', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'running' },
      });

      const res = await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'failed' })
        .expect(200);

      expect(res.body.status).toBe('failed');
    });
  });

  describe('PATCH /jobs/:id/status — invalid transitions', () => {
    it('pending → completed returns 400', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'pending' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'completed' })
        .expect(400);
    });

    it('pending → failed returns 400', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'pending' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'failed' })
        .expect(400);
    });

    it('completed → running returns 400', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'completed' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'running' })
        .expect(400);
    });

    it('failed → running returns 400', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'failed' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'running' })
        .expect(400);
    });

    it('completed → failed returns 400', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'completed' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'failed' })
        .expect(400);
    });

    it('returns 400 for an invalid status value', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'pending' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'not-a-real-status' })
        .expect(400);
    });

    it('returns 400 when attempting to PATCH to pending', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job', type: 'type', status: 'running' },
      });

      await request(server)
        .patch(`/jobs/${job.id}/status`)
        .send({ status: 'pending' })
        .expect(400);
    });

    it('returns 404 for a non-existent job', async () => {
      await request(server)
        .patch('/jobs/nonexistent-id/status')
        .send({ status: 'running' })
        .expect(404);
    });
  });

  describe('PATCH /jobs/:id/status — concurrency', () => {
    it(
      'exactly one concurrent request wins and the other returns 409',
      async () => {

        const job = await prisma.job.create({
          data: { title: 'Race Job', type: 'test', status: 'pending' },
        });

        const [res1, res2] = await Promise.all([
          request(server)
            .patch(`/jobs/${job.id}/status`)
            .send({ status: 'running' }),
          request(server)
            .patch(`/jobs/${job.id}/status`)
            .send({ status: 'running' }),
        ]);

        const statuses = [res1.status, res2.status];

        expect(statuses).toContain(200);
        expect(statuses).toContain(409);
        expect(statuses.filter((s) => s === 200)).toHaveLength(1);
        expect(statuses.filter((s) => s === 409)).toHaveLength(1);

        const conflictResponse = res1.status === 409 ? res1 : res2;
        expect(conflictResponse.body.statusCode).toBe(409);
        expect(conflictResponse.body.error).toBe('Conflict');

        const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
        expect(finalJob?.status).toBe('running');
      },
    );
  });

  describe('DELETE /jobs/:id', () => {
    it('deletes an existing job and returns 204', async () => {
      const job = await prisma.job.create({
        data: { title: 'Job to delete', type: 'type', status: 'pending' },
      });

      await request(server).delete(`/jobs/${job.id}`).expect(204);

      const found = await prisma.job.findUnique({ where: { id: job.id } });
      expect(found).toBeNull();
    });

    it('returns 404 when deleting a non-existent job', async () => {
      await request(server).delete('/jobs/nonexistent-id').expect(404);
    });
  });
});
