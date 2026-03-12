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

@Controller('identity-anchors')
export class IdentityAnchorController {
  constructor(private service: IdentityAnchorService) {}

  @Get()
  async list() {
    return this.service.list();
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
  ) {
    return this.service.create(body);
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
  async getHistory() {
    return this.service.getHistory();
  }

  @Post('migrate')
  async migrateFromMemory() {
    return this.service.migrateFromMemory();
  }
}
