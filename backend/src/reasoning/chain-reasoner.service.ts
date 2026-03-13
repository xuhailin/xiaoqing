import { Injectable } from '@nestjs/common';
import type { IReasoner, ReasoningContext, ReasoningResult } from './reasoner.interface';
import type { CapabilityChain } from './capability-chain';

interface ChainPattern {
  keywords: string[];
  chain: CapabilityChain;
}

@Injectable()
export class ChainReasoner implements IReasoner {
  private readonly patterns: ChainPattern[] = [
    {
      keywords: ['搜索', '总结', 'search', 'summarize'],
      chain: {
        description: 'Search and summarize',
        steps: [
          { capability: 'search_web', params: {}, outputMapping: { content: 'results' } },
          { capability: 'summarize', params: {} },
        ],
      },
    },
    {
      keywords: ['下载', '保存', 'download', 'save'],
      chain: {
        description: 'Download and save',
        steps: [
          { capability: 'book_download', params: {}, outputMapping: { content: 'bookContent' } },
          { capability: 'save_note', params: {} },
        ],
      },
    },
  ];

  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const matched = this.matchPattern(context.userInput);

    if (matched) {
      return {
        decision: 'run_chain',
        capabilities: matched.chain.steps.map(s => s.capability),
        params: { chain: matched.chain },
        reasoning: `Matched chain pattern: ${matched.chain.description}`,
      };
    }

    return {
      decision: 'direct_reply',
      capabilities: [],
      reasoning: 'No chain pattern matched',
    };
  }

  private matchPattern(input: string): ChainPattern | null {
    const lower = input.toLowerCase();
    for (const pattern of this.patterns) {
      const matchCount = pattern.keywords.filter(kw => lower.includes(kw)).length;
      if (matchCount >= 2) {
        return pattern;
      }
    }
    return null;
  }
}
