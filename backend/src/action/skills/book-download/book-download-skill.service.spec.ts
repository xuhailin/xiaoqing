import { BookDownloadSkillService } from './book-download-skill.service';
import { executeBookDownloadWorkflow } from './book-download.executor';

jest.mock('./book-download.executor', () => ({
  executeBookDownloadWorkflow: jest.fn(),
}));

describe('BookDownloadSkillService', () => {
  const mockExecute = executeBookDownloadWorkflow as jest.MockedFunction<typeof executeBookDownloadWorkflow>;

  function createService(resourceBaseUrl: string) {
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RESOURCE_BASE_URL') return resourceBaseUrl;
        return '';
      }),
    } as any;
    return new BookDownloadSkillService(config);
  }

  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('uses skill-local workflow executor on success', async () => {
    const service = createService('https://example.com');
    mockExecute.mockResolvedValue({ ok: true, message: '已保存到：/tmp/a.epub' });

    const result = await service.execute({ bookName: '三体' });

    expect(mockExecute).toHaveBeenCalledWith('三体', undefined, undefined);
    expect(result.success).toBe(true);
    expect(result.content).toContain('已保存到');
    expect(result.error).toBeUndefined();
  });

  it('returns error when resource base url is missing', async () => {
    const service = createService('');
    const result = await service.execute({ bookName: '三体' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('未配置 RESOURCE_BASE_URL');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('formats choices when workflow returns non-ok', async () => {
    const service = createService('https://example.com');
    mockExecute.mockResolvedValue({
      ok: false,
      message: '找到 2 条资源',
      choices: [
        { title: 'Book A', index: 0 },
        { title: 'Book B', index: 1 },
      ],
    });

    const result = await service.execute({ bookName: 'book' });

    expect(result.success).toBe(false);
    expect(result.content).toContain('找到 2 条资源');
    expect(result.content).toContain('0: Book A');
    expect(result.error).toContain('找到 2 条资源');
  });
});
