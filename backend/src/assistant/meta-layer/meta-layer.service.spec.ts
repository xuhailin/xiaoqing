import { MetaLayerService } from './meta-layer.service';

describe('MetaLayerService', () => {
  const policy = `- 禁止解释自己的对话策略
- 禁止描述内部逻辑
- 像真实朋友一样说话`;

  let service: MetaLayerService;

  beforeEach(() => {
    service = new MetaLayerService();
  });

  it('removes high-confidence strategy explanations', () => {
    const result = service.filter('我会先接住你再慢慢说。先说正事。', policy);

    expect(result.adjusted).toBe(true);
    expect(result.content).toBe('先说正事。');
    expect(result.reasons).toContain('removed-strategy-explanation');
  });

  it('rewrites internal-logic phrasing into natural wording', () => {
    const result = service.filter('我判断你现在更需要被理解。', policy);

    expect(result.adjusted).toBe(true);
    expect(result.content).toBe('我先陪你把这一下接住。');
    expect(result.reasons).toContain('rewrote-internal-logic');
  });

  it('rewrites prompt-leak boundary statements without exposing system wording', () => {
    const result = service.filter('根据我的设定我不能直接替你完成。', policy);

    expect(result.adjusted).toBe(true);
    expect(result.content).toBe('这个我做不了，但我可以换个方式帮你。');
    expect(result.reasons).toContain('removed-prompt-leak');
  });
});
