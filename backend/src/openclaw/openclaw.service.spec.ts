import { ConfigService } from '@nestjs/config';
import { OpenClawService } from './openclaw.service';

describe('OpenClawService', () => {
  describe('FEATURE_OPENCLAW disabled', () => {
    it('delegateTask returns without remote call when FEATURE_OPENCLAW is not true', async () => {
      const config = new ConfigService({
        FEATURE_OPENCLAW: 'false',
        OPENCLAW_PLUGIN_BASE_URL: 'https://example.com',
        OPENCLAW_TOKEN: 'token',
      });
      const service = new OpenClawService(config);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve('') } as Response);

      const result = await service.delegateTask({
        message: 'test task',
        sessionKey: 'sk',
      });

      expect(result).toEqual({ success: false, content: '', error: 'OpenClaw 已禁用' });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('delegateTask returns without remote call when FEATURE_OPENCLAW is unset', async () => {
      const config = new ConfigService({
        OPENCLAW_PLUGIN_BASE_URL: 'https://example.com',
      });
      const service = new OpenClawService(config);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: () => Promise.resolve('') } as Response);

      const result = await service.delegateTask({ message: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('OpenClaw 已禁用');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
