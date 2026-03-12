import { Controller, Get, Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { CognitiveGrowthService, type GrowthItemType } from './cognitive-growth.service';

@Controller('growth')
export class GrowthController {
  constructor(private growth: CognitiveGrowthService) {}

  /** 获取所有待确认的成长记录 */
  @Get('pending')
  async getPending() {
    return this.growth.getPending();
  }

  /** 确认一条成长记录 */
  @Patch(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body() body: { type: GrowthItemType },
  ) {
    this.validateType(body?.type);
    await this.growth.confirmGrowth(id, body.type);
    return { ok: true };
  }

  /** 拒绝一条成长记录 */
  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { type: GrowthItemType },
  ) {
    this.validateType(body?.type);
    await this.growth.rejectGrowth(id, body.type);
    return { ok: true };
  }

  private validateType(type: unknown): asserts type is GrowthItemType {
    if (type !== 'cognitive_profile' && type !== 'relationship_state') {
      throw new BadRequestException('type must be "cognitive_profile" or "relationship_state"');
    }
  }
}
