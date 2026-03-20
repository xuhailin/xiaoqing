import { ConfigService } from '@nestjs/config';
import { OpenClawRegistryService } from './openclaw-registry.service';
import { OpenClawService } from './openclaw.service';

describe('OpenClawService', () => {
  it('delegateTask returns error when no agents registered', async () => {
    const config = new ConfigService({});
    const registry = new OpenClawRegistryService(config);
    const service = new OpenClawService(registry);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve('') } as Response);

    const result = await service.delegateTask({
      message: 'test task',
      sessionKey: 'sk',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('无可用 Agent');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('isAvailable returns false when no agents', () => {
    const config = new ConfigService({});
    const registry = new OpenClawRegistryService(config);
    const service = new OpenClawService(registry);

    expect(service.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when OPENCLAW_AGENTS has valid entry', () => {
    const agentsJson = JSON.stringify([
      {
        id: 't1',
        name: 'Test',
        baseUrl: 'https://example.com',
        token: 'tok',
        capabilities: ['general'],
      },
    ]);
    const config = new ConfigService({ OPENCLAW_AGENTS: agentsJson });
    const registry = new OpenClawRegistryService(config);
    const service = new OpenClawService(registry);

    expect(service.isAvailable()).toBe(true);
  });
});
