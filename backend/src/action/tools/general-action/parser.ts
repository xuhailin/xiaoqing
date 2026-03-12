import type { ParseGeneralActionResult } from './types';

function parseKeyValuePairs(input: string): Record<string, string> {
  const output: Record<string, string> = {};
  const regex = /([a-zA-Z_]+)=("([^"]*)"|'([^']*)'|[^\s]+)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(input)) !== null) {
    const key = String(match[1] ?? '').trim().toLowerCase();
    const value = (match[3] ?? match[4] ?? match[2] ?? '').replace(/^['"]|['"]$/g, '').trim();
    if (key) output[key] = value;
  }
  return output;
}

function pickUrl(input: string, kv: Record<string, string>): string {
  if (kv.url) return kv.url;
  const m = input.match(/https?:\/\/[^\s]+/i);
  return m?.[0] ?? '';
}

function missing(message: string, reason: string): ParseGeneralActionResult {
  return { status: 'validation_error', message, reason };
}

export function parseGeneralAction(input: string): ParseGeneralActionResult {
  const raw = String(input ?? '').trim();
  if (!raw) return missing('动作输入为空', 'empty_input');

  const lowered = raw.toLowerCase();
  const kv = parseKeyValuePairs(raw);

  if (
    /^(open|visit|goto)\b/i.test(raw) ||
    /^(打开|访问|前往|浏览)\s*/.test(raw) ||
    lowered.startsWith('browser.goto')
  ) {
    const url = pickUrl(raw, kv);
    if (!url) return missing('browser.goto 需要 url', 'missing_url');
    return { status: 'ok', action: { type: 'browser.goto', url } };
  }

  if (lowered.startsWith('browser.click') || /(点击|click)/i.test(raw)) {
    const url = pickUrl(raw, kv);
    const selector = kv.selector ?? kv.sel ?? '';
    if (!url) return missing('browser.click 需要 url', 'missing_url');
    if (!selector) return missing('browser.click 需要 selector', 'missing_selector');
    return { status: 'ok', action: { type: 'browser.click', url, selector } };
  }

  if (lowered.startsWith('browser.fill') || /(输入|填写|fill)/i.test(raw)) {
    const url = pickUrl(raw, kv);
    const selector = kv.selector ?? kv.sel ?? '';
    const value = kv.value ?? kv.text ?? '';
    if (!url) return missing('browser.fill 需要 url', 'missing_url');
    if (!selector) return missing('browser.fill 需要 selector', 'missing_selector');
    if (!value) return missing('browser.fill 需要 value', 'missing_value');
    return { status: 'ok', action: { type: 'browser.fill', url, selector, value } };
  }

  if (lowered.startsWith('browser.wait') || /(等待|wait)/i.test(raw)) {
    const url = pickUrl(raw, kv);
    const selector = kv.selector ?? kv.sel ?? '';
    if (!url) return missing('browser.wait 需要 url', 'missing_url');
    if (!selector) return missing('browser.wait 需要 selector', 'missing_selector');
    return { status: 'ok', action: { type: 'browser.wait', url, selector } };
  }

  if (lowered.startsWith('file.read') || /(读取文件|读文件|read file)/i.test(raw)) {
    const target = kv.path ?? kv.file ?? '';
    if (!target) return missing('file.read 需要 path', 'missing_path');
    return { status: 'ok', action: { type: 'file.read', path: target } };
  }

  if (lowered.startsWith('file.write') || /(写入文件|写文件|write file)/i.test(raw)) {
    const target = kv.path ?? kv.file ?? '';
    const content = kv.content ?? kv.text ?? '';
    if (!target) return missing('file.write 需要 path', 'missing_path');
    if (!content) return missing('file.write 需要 content', 'missing_content');
    return { status: 'ok', action: { type: 'file.write', path: target, content } };
  }

  if (lowered.startsWith('file.exists') || /(检查文件|文件是否存在|exists)/i.test(raw)) {
    const target = kv.path ?? kv.file ?? '';
    if (!target) return missing('file.exists 需要 path', 'missing_path');
    return { status: 'ok', action: { type: 'file.exists', path: target } };
  }

  if (lowered.startsWith('file.list') || /(列出目录|查看目录|list dir|ls)/i.test(raw)) {
    const target = kv.path ?? kv.dir ?? '';
    if (!target) return missing('file.list 需要 path', 'missing_path');
    return { status: 'ok', action: { type: 'file.list', path: target } };
  }

  if (lowered.startsWith('file.mkdir') || /(创建目录|新建目录|mkdir)/i.test(raw)) {
    const target = kv.path ?? kv.dir ?? '';
    if (!target) return missing('file.mkdir 需要 path', 'missing_path');
    return { status: 'ok', action: { type: 'file.mkdir', path: target } };
  }

  return { status: 'not_supported', reason: 'no_supported_action' };
}
