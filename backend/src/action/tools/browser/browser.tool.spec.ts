import { BrowserTool, type PageHandle } from './browser.tool';

describe('BrowserTool', () => {
  function fakePage(): PageHandle {
    return {
      goto: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForEvent: jest.fn().mockResolvedValue({ saveAs: jest.fn().mockResolvedValue(undefined) }),
      waitForURL: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn() as any,
    };
  }

  it('validates url format before goto', async () => {
    const tool = new BrowserTool({ timeoutMs: 10 });
    const page = fakePage();
    await expect(tool.goto(page, 'ftp://example.com')).rejects.toThrow('URL 仅支持 http/https');
  });

  it('validates selector before click', async () => {
    const tool = new BrowserTool({ timeoutMs: 10 });
    const page = fakePage();
    await expect(tool.click(page, '   ')).rejects.toThrow('selector 不能为空');
  });

  it('calls page.goto for valid url', async () => {
    const tool = new BrowserTool({ timeoutMs: 10 });
    const page = fakePage();
    await tool.goto(page, 'https://example.com');
    expect(page.goto).toHaveBeenCalled();
  });
});
