import { parseGeneralAction } from './parser';

describe('parseGeneralAction', () => {
  it('parses browser goto action', () => {
    const parsed = parseGeneralAction('open https://example.com');
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') throw new Error('expected ok');
    expect(parsed.action).toEqual({
      type: 'browser.goto',
      url: 'https://example.com',
    });
  });

  it('returns validation error for missing file path', () => {
    const parsed = parseGeneralAction('file.read');
    expect(parsed.status).toBe('validation_error');
    if (parsed.status !== 'validation_error') throw new Error('expected validation_error');
    expect(parsed.reason).toBe('missing_path');
  });

  it('returns not_supported for unknown request', () => {
    const parsed = parseGeneralAction('帮我发邮件给张三');
    expect(parsed.status).toBe('not_supported');
  });
});
