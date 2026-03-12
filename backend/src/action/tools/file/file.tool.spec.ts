import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileTool } from './file.tool';

describe('FileTool', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-tool-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('allows read/write within allowlist', async () => {
    const tool = new FileTool({ allowlist: [baseDir], cwd: baseDir });
    const target = path.join(baseDir, 'a.txt');
    await tool.writeText(target, 'hello');
    const got = await tool.readText(target);
    expect(got).toBe('hello');
  });

  it('rejects path traversal outside allowlist', async () => {
    const tool = new FileTool({ allowlist: [baseDir], cwd: baseDir });
    const traversal = path.join(baseDir, '..', 'outside.txt');
    await expect(tool.writeText(traversal, 'x')).rejects.toThrow('路径不在白名单内');
  });

  it('normalizes relative paths against cwd', async () => {
    const tool = new FileTool({ allowlist: [baseDir], cwd: baseDir });
    await tool.writeText('./nested/b.txt', 'ok');
    const got = await tool.readText('./nested/b.txt');
    expect(got).toBe('ok');
  });
});
