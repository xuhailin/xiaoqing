import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IdentityAnchorService } from './identity-anchor.service';
import { UserId } from '../../infra/user-id.decorator';

@Controller('identity-anchors')
export class IdentityAnchorController {
  constructor(private service: IdentityAnchorService) {}

  @Get()
  async list(@UserId() userId?: string) {
    return this.service.list(userId ?? 'default-user');
  }

  @Post()
  async create(
    @Body()
    body: {
      label: string;
      content: string;
      sortOrder?: number;
      nickname?: string;
    },
    @UserId() userId?: string,
  ) {
    return this.service.create(body, userId ?? 'default-user');
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      label?: string;
      content?: string;
      sortOrder?: number;
      nickname?: string;
    },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get('history')
  async getHistory(@UserId() userId?: string) {
    return this.service.getHistory(userId ?? 'default-user');
  }

  @Post('migrate')
  async migrateFromMemory(@UserId() userId?: string) {
    return this.service.migrateFromMemory(userId ?? 'default-user');
  }
}
