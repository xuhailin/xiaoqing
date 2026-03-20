import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IdeaService } from './idea.service';
import type { CreateIdeaInput, PromoteIdeaInput, UpdateIdeaInput } from './idea.types';

@Controller('ideas')
export class IdeaController {
  constructor(private readonly ideaService: IdeaService) {}

  @Post()
  create(@Body() body: CreateIdeaInput) {
    return this.ideaService.createIdea(body);
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.ideaService.listIdeas(status as any);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ideaService.getIdea(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateIdeaInput) {
    return this.ideaService.updateIdea(id, body);
  }

  @Post(':id/promote')
  promote(@Param('id') id: string, @Body() body: PromoteIdeaInput) {
    return this.ideaService.promoteToTodo(id, body);
  }
}
