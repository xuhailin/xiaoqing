import { Body, Controller, Param, Post } from '@nestjs/common';
import { SummarizerService } from './summarizer.service';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { EvolutionSchedulerService } from '../persona/evolution-scheduler.service';

@Controller()
export class SummarizerController {
  constructor(
    private summarizer: SummarizerService,
    private prisma: PrismaService,
    private persona: PersonaService,
    private evolutionScheduler: EvolutionSchedulerService,
  ) {}

  @Post('conversations/:id/summarize')
  async summarize(
    @Param('id') id: string,
    @Body() body?: { messageIds?: string[] },
  ) {
    const result = await this.summarizer.summarize(id, body?.messageIds);

    const msgs = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const recent = msgs.reverse().map((m) => ({ role: m.role, content: m.content }));
    const evo = await this.persona.suggestEvolution(recent);

    if (evo.changes.length > 0) {
      const isUserPref = (field: string) =>
        field === 'preferredVoiceStyle'
        || field === 'praisePreference'
        || field === 'responseRhythm';
      const preferenceChanges = evo.changes.filter((c) => isUserPref(c.targetField ?? c.field));
      const personaChanges = evo.changes.filter((c) => !isUserPref(c.targetField ?? c.field));

      if (preferenceChanges.length > 0) {
        await this.persona.confirmEvolution(preferenceChanges);
      }

      if (personaChanges.length === 0) return result;

      this.evolutionScheduler.setPendingSuggestion({
        changes: personaChanges,
        triggerReason: '手动总结后触发',
        createdAt: new Date(),
      });
    }

    return result;
  }
}
