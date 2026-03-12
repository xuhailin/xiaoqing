import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BrowserSessionManager } from './browser-session.manager';
import type { StorageState } from './browser.tool';

describe('BrowserSessionManager', () => {
  let tmpDir: string;
  let manager: BrowserSessionManager;

  const validState: StorageState = {
    cookies: [{ name: 'sid', value: 'abc123' }],
    origins: [{ origin: 'https://example.com', localStorage: [] }],
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-test-'));
    manager = new BrowserSessionManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when no session exists', async () => {
    expect(await manager.load('nonexistent')).toBeUndefined();
  });

  it('saves and loads a valid storageState', async () => {
    await manager.save('site1', validState);
    const loaded = await manager.load('site1');
    expect(loaded).toEqual(validState);
  });

  it('clears a saved session', async () => {
    await manager.save('site1', validState);
    await manager.clear('site1');
    expect(await manager.load('site1')).toBeUndefined();
  });

  it('clear does not throw when file does not exist', async () => {
    await expect(manager.clear('missing')).resolves.toBeUndefined();
  });

  it('returns undefined for malformed JSON', async () => {
    const filePath = path.join(tmpDir, 'bad.json');
    await fs.writeFile(filePath, '{ not valid json', 'utf-8');
    const mgr = new BrowserSessionManager(tmpDir);
    expect(await mgr.load('bad')).toBeUndefined();
  });

  it('sanitizes siteKey for file name', async () => {
    await manager.save('https://example.com/path', validState);
    const loaded = await manager.load('https://example.com/path');
    expect(loaded).toEqual(validState);
  });
});
