import { SiteAuthService, type SiteAuthConfig } from './site-auth.service';
import { BrowserTool, type PageHandle, type StorageState } from './browser.tool';
import { BrowserSessionManager } from './browser-session.manager';

function fakeConfig(overrides?: Partial<SiteAuthConfig>): SiteAuthConfig {
  return {
    siteKey: 'test-site',
    baseUrl: 'https://example.com',
    email: 'user@test.com',
    password: 'pass123',
    loginSelector: 'a.login',
    loginEmailSelector: 'input[name="email"]',
    loginPasswordSelector: 'input[type="password"]',
    loginSubmitSelector: 'button[type="submit"]',
    loginSuccessSelector: '#dashboard',
    ...overrides,
  };
}

function fakePage(): PageHandle {
  return {
    url: jest.fn().mockReturnValue('https://example.com'),
    goto: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue({ saveAs: jest.fn() }),
    waitForURL: jest.fn().mockResolvedValue(undefined),
    locator: jest.fn() as any,
  };
}

const savedState: StorageState = {
  cookies: [{ name: 'sid', value: 'abc' }],
  origins: [],
};

describe('SiteAuthService', () => {
  let browser: jest.Mocked<BrowserTool>;
  let session: jest.Mocked<BrowserSessionManager>;
  let page: PageHandle;

  beforeEach(() => {
    page = fakePage();
    browser = {
      launch: jest.fn().mockResolvedValue(undefined),
      createContext: jest.fn().mockResolvedValue(undefined),
      getStorageState: jest.fn().mockResolvedValue(savedState),
      newPage: jest.fn().mockResolvedValue(page),
      goto: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      waitFor: jest.fn().mockResolvedValue(undefined),
      waitForURL: jest.fn().mockResolvedValue(undefined),
      waitForDownload: jest.fn(),
      saveDownload: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    session = {
      load: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  it('skips login when no credentials configured', async () => {
    const auth = new SiteAuthService(browser, session, fakeConfig({ email: '', password: '' }));
    await auth.ensureLoggedIn();
    expect(session.load).not.toHaveBeenCalled();
    expect(browser.createContext).not.toHaveBeenCalled();
  });

  it('restores session from disk when valid', async () => {
    session.load.mockResolvedValue(savedState);
    // After restoring session, isLoggedIn check will succeed (waitFor resolves)
    const auth = new SiteAuthService(browser, session, fakeConfig());
    await auth.ensureLoggedIn();

    expect(session.load).toHaveBeenCalledWith('test-site');
    expect(browser.createContext).toHaveBeenCalledWith(savedState);
    // Should NOT have done a full login (only 1 createContext call for restore)
    expect(browser.createContext).toHaveBeenCalledTimes(1);
  });

  it('falls back to login when saved session is expired', async () => {
    session.load.mockResolvedValue(savedState);
    // First createContext + goto + waitFor = session check.
    // Make waitFor fail on first call (session expired), succeed on subsequent calls (login success)
    let waitForCallCount = 0;
    browser.waitFor.mockImplementation(async () => {
      waitForCallCount++;
      if (waitForCallCount === 1) throw new Error('element not found');
    });

    const auth = new SiteAuthService(browser, session, fakeConfig());
    await auth.ensureLoggedIn();

    expect(session.clear).toHaveBeenCalledWith('test-site');
    // createContext called twice: once for restore attempt, once for fresh login
    expect(browser.createContext).toHaveBeenCalledTimes(2);
    expect(session.save).toHaveBeenCalledWith('test-site', savedState);
  });

  it('logs in fresh when no saved session exists', async () => {
    session.load.mockResolvedValue(undefined);
    const auth = new SiteAuthService(browser, session, fakeConfig());
    await auth.ensureLoggedIn();

    expect(browser.createContext).toHaveBeenCalledTimes(1);
    expect(browser.createContext).toHaveBeenCalledWith(); // no storageState
    expect(browser.fill).toHaveBeenCalledTimes(2); // email + password
    expect(session.save).toHaveBeenCalledWith('test-site', savedState);
  });

  it('does not read or persist storageState when disabled', async () => {
    const auth = new SiteAuthService(browser, session, fakeConfig({ useStorageState: false }));
    await auth.ensureLoggedIn();

    expect(session.load).not.toHaveBeenCalled();
    expect(session.save).not.toHaveBeenCalled();
    expect(session.clear).not.toHaveBeenCalled();
    expect(browser.createContext).toHaveBeenCalledTimes(1);
    expect(browser.fill).toHaveBeenCalledTimes(2);
  });

  it('falls back to clicking labels when input is covered', async () => {
    let fillCount = 0;
    browser.fill.mockImplementation(async () => {
      fillCount += 1;
      if (fillCount === 1 || fillCount === 3) {
        throw new Error('element receives pointer events from label');
      }
    });

    const auth = new SiteAuthService(
      browser,
      session,
      fakeConfig({
        loginEmailLabelSelector: '.email-label',
        loginPasswordLabelSelector: '.password-label',
      }),
    );
    await auth.ensureLoggedIn();

    expect(browser.click).toHaveBeenCalledWith(page, '.email-label');
    expect(browser.click).toHaveBeenCalledWith(page, '.password-label');
    expect(browser.fill).toHaveBeenCalledTimes(4);
  });

  it('getPage returns the same page on repeated calls', async () => {
    const auth = new SiteAuthService(browser, session, fakeConfig({ email: '', password: '' }));
    const p1 = await auth.getPage();
    const p2 = await auth.getPage();
    expect(p1).toBe(p2);
    expect(browser.newPage).toHaveBeenCalledTimes(1);
  });
});
