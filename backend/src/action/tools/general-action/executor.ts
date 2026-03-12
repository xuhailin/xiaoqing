import { ToolError } from '../core/tool-error';
import { BrowserTool } from '../browser/browser.tool';
import { FileTool } from '../file/file.tool';
import { parseGeneralAction } from './parser';
import type { GeneralAction, GeneralActionResult } from './types';

async function executeBrowserAction(
  browser: BrowserTool,
  action: Extract<GeneralAction, { type: `browser.${string}` }>,
): Promise<GeneralActionResult> {
  const page = await browser.newPage();
  if (action.type === 'browser.goto') {
    await browser.goto(page, action.url);
    return { ok: true, code: 'OK', message: `已打开页面：${action.url}`, meta: { actionType: action.type } };
  }

  await browser.goto(page, action.url);
  if (action.type === 'browser.click') {
    await browser.click(page, action.selector);
    return {
      ok: true,
      code: 'OK',
      message: `已点击元素：${action.selector}`,
      meta: { actionType: action.type, selector: action.selector },
    };
  }
  if (action.type === 'browser.fill') {
    await browser.fill(page, action.selector, action.value);
    return {
      ok: true,
      code: 'OK',
      message: `已填写元素：${action.selector}`,
      meta: { actionType: action.type, selector: action.selector },
    };
  }
  await browser.waitFor(page, action.selector);
  return {
    ok: true,
    code: 'OK',
    message: `已等待元素出现：${action.selector}`,
    meta: { actionType: action.type, selector: action.selector },
  };
}

async function executeFileAction(
  file: FileTool,
  action: Extract<GeneralAction, { type: `file.${string}` }>,
): Promise<GeneralActionResult> {
  if (action.type === 'file.read') {
    const text = await file.readText(action.path);
    return { ok: true, code: 'OK', message: text, meta: { actionType: action.type, path: action.path } };
  }
  if (action.type === 'file.write') {
    const saved = await file.writeText(action.path, action.content);
    return { ok: true, code: 'OK', message: `已写入文件：${saved}`, meta: { actionType: action.type, path: saved } };
  }
  if (action.type === 'file.exists') {
    const exists = await file.exists(action.path);
    return {
      ok: true,
      code: 'OK',
      message: exists ? '文件存在' : '文件不存在',
      meta: { actionType: action.type, path: action.path, exists },
    };
  }
  if (action.type === 'file.list') {
    const entries = await file.list(action.path);
    return {
      ok: true,
      code: 'OK',
      message: entries.length ? entries.join('\n') : '(empty)',
      meta: { actionType: action.type, path: action.path, count: entries.length },
    };
  }
  const created = await file.ensureDir(action.path);
  return { ok: true, code: 'OK', message: `已创建目录：${created}`, meta: { actionType: action.type, path: created } };
}

export async function executeGeneralAction(input: string): Promise<GeneralActionResult> {
  const parsed = parseGeneralAction(input);
  if (parsed.status === 'not_supported') {
    return {
      ok: false,
      code: 'NOT_SUPPORTED',
      message: '当前只支持单步、低风险、本地确定性的 browser/file 动作。',
      meta: { reasonCode: parsed.reason },
    };
  }
  if (parsed.status === 'validation_error') {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: parsed.message,
      meta: { reasonCode: parsed.reason },
    };
  }

  const browser = new BrowserTool();
  const file = new FileTool();
  try {
    switch (parsed.action.type) {
      case 'browser.goto':
      case 'browser.click':
      case 'browser.fill':
      case 'browser.wait':
        return await executeBrowserAction(browser, parsed.action);
      default:
        return await executeFileAction(file, parsed.action);
    }
  } catch (e) {
    if (e instanceof ToolError) {
      return {
        ok: false,
        code: e.code,
        message: e.message,
        meta: { reasonCode: e.code, actionType: parsed.action.type },
      };
    }
    return {
      ok: false,
      code: 'EXECUTION_ERROR',
      message: e instanceof Error ? e.message : String(e),
      meta: { reasonCode: 'EXECUTION_ERROR', actionType: parsed.action.type },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
