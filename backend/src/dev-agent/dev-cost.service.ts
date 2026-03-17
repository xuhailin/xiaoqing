import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';

export class BudgetExceededError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly totalCostUsd: number,
    public readonly budgetUsd: number,
  ) {
    super(
      `会话预算已超限：已花费 $${totalCostUsd.toFixed(4)}，预算 $${budgetUsd.toFixed(4)}`,
    );
    this.name = 'BudgetExceededError';
  }
}

@Injectable()
export class DevCostService {
  private readonly logger = new Logger(DevCostService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录 run 成本并累加到 session。
   * 在 run 完成（success/failed）后调用。
   */
  async recordRunCost(runId: string, costUsd: number): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd < 0) {
      return;
    }

    const run = await this.prisma.devRun.update({
      where: { id: runId },
      data: { costUsd },
      select: { sessionId: true },
    });

    await this.prisma.devSession.update({
      where: { id: run.sessionId },
      data: { totalCostUsd: { increment: costUsd } },
    });

    this.logger.log(
      `Cost recorded: run=${runId} cost=$${costUsd.toFixed(4)}`,
    );
  }

  /**
   * 检查 session 是否还有预算余量。
   * 如果 budgetUsd 为 null，表示不限制，直接通过。
   * @throws BudgetExceededError 当已超预算时
   */
  async checkBudget(sessionId: string): Promise<void> {
    const session = await this.prisma.devSession.findUnique({
      where: { id: sessionId },
      select: { budgetUsd: true, totalCostUsd: true },
    });

    if (!session || session.budgetUsd == null) {
      return; // 无预算限制
    }

    if (session.totalCostUsd >= session.budgetUsd) {
      throw new BudgetExceededError(
        sessionId,
        session.totalCostUsd,
        session.budgetUsd,
      );
    }
  }

  /**
   * 获取 session 的成本概览。
   */
  async getSessionCostSummary(sessionId: string) {
    const session = await this.prisma.devSession.findUnique({
      where: { id: sessionId },
      select: { budgetUsd: true, totalCostUsd: true },
    });

    if (!session) {
      return null;
    }

    const remainingUsd =
      session.budgetUsd != null
        ? Math.max(0, session.budgetUsd - session.totalCostUsd)
        : null;

    return {
      totalCostUsd: session.totalCostUsd,
      budgetUsd: session.budgetUsd,
      remainingUsd,
      budgetExhausted:
        session.budgetUsd != null &&
        session.totalCostUsd >= session.budgetUsd,
    };
  }

  /**
   * 设置 session 预算上限。
   */
  async setSessionBudget(
    sessionId: string,
    budgetUsd: number | null,
  ): Promise<void> {
    await this.prisma.devSession.update({
      where: { id: sessionId },
      data: { budgetUsd },
    });

    this.logger.log(
      `Budget set: session=${sessionId} budget=${budgetUsd != null ? `$${budgetUsd.toFixed(2)}` : 'unlimited'}`,
    );
  }
}
