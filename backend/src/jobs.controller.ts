import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode,
} from '@nestjs/common';
import { IsString, IsNotEmpty, MaxLength, IsEnum } from 'class-validator';
import { JobStatus } from '@prisma/client';
import { JobsService } from './jobs.service.js';

class CreateJobDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  type: string;
}

class UpdateStatusDto {
  @IsEnum(JobStatus, { message: `status must be one of: ${Object.values(JobStatus).join(', ')}` })
  status: JobStatus;
}

@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get()
  getAll(@Query('status') status?: string) {
    return this.jobs.getAll(status);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateJobDto) {
    return this.jobs.create(body.title, body.type);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateStatusDto) {
    return this.jobs.updateStatus(id, body.status);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.jobs.remove(id);
  }
}
