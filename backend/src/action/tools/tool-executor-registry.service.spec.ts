import { ToolExecutorRegistry } from './tool-executor-registry.service';
import type { WeatherSkillService } from '../skills/weather/weather-skill.service';
import type { BookDownloadSkillService } from '../skills/book-download/book-download-skill.service';
import type { GeneralActionSkillService } from '../skills/general-action/general-action-skill.service';
import type { TimesheetSkillService } from '../skills/timesheet/timesheet-skill.service';
import type { OpenClawService } from '../../openclaw/openclaw.service';
import type { DialogueIntentState } from '../../assistant/intent/intent.types';

const intentState = {
  mode: 'task',
  seriousness: 'focused',
  expectation: '直接给结果',
  agency: '执行器',
  requiresTool: true,
  taskIntent: 'general_tool',
  slots: {},
  escalation: '不推进',
  confidence: 0.9,
  missingParams: [],
} as unknown as DialogueIntentState;

describe('ToolExecutorRegistry local-general-action', () => {
  function createRegistry() {
    const weather = {
      isAvailable: jest.fn().mockReturnValue(true),
      execute: jest.fn(),
    } as unknown as WeatherSkillService;
    const book = {
      isAvailable: jest.fn().mockReturnValue(true),
      execute: jest.fn(),
    } as unknown as BookDownloadSkillService;
    const general = {
      isAvailable: jest.fn().mockReturnValue(true),
      execute: jest.fn(),
    } as unknown as GeneralActionSkillService;
    const timesheet = {
      isAvailable: jest.fn().mockReturnValue(false),
      execute: jest.fn(),
    } as unknown as TimesheetSkillService;
    const openclaw = {
      delegateTask: jest.fn(),
    } as unknown as OpenClawService;
    return {
      registry: new ToolExecutorRegistry(weather, book, general, timesheet, openclaw),
      general,
      timesheet,
    };
  }

  it('returns success with reasonCode meta when local general action succeeds', async () => {
    const { registry, general } = createRegistry();
    (general.execute as jest.Mock).mockResolvedValue({
      success: true,
      content: 'done',
      code: 'OK',
      meta: { actionType: 'file.read' },
    });

    const result = await registry.execute({
      conversationId: 'c1',
      turnId: 't1',
      userInput: 'read file',
      executor: 'local-general-action',
      capability: 'general_tool',
      intentState,
      params: { input: 'file.read path=/tmp/a.txt' },
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe('done');
    expect(result.error).toBeNull();
    expect(result.meta).toMatchObject({
      reasonCode: 'OK',
      actionType: 'file.read',
    });
  });

  it('returns fail when general action params are invalid', async () => {
    const { registry } = createRegistry();
    const result = await registry.execute({
      conversationId: 'c1',
      turnId: 't1',
      userInput: 'bad',
      executor: 'local-general-action',
      capability: 'general_tool',
      intentState,
      params: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('general_action params invalid');
  });

  it('passes preview timesheet action to local timesheet skill', async () => {
    const { registry, timesheet } = createRegistry();
    (timesheet.execute as jest.Mock).mockResolvedValue({
      success: true,
      content: 'preview',
      previewEntries: [],
      totalHours: 8,
    });

    const result = await registry.execute({
      conversationId: 'c1',
      turnId: 't1',
      userInput: '先预览今天工时',
      executor: 'local-timesheet',
      capability: 'timesheet',
      intentState,
      params: {
        timesheetAction: 'preview',
        timesheetDate: '2026-03-10',
      },
    });

    expect(timesheet.execute).toHaveBeenCalledWith({
      action: 'preview',
      targetDate: '2026-03-10',
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('preview');
  });

  it('passes confirm rawOverride to local timesheet skill', async () => {
    const { registry, timesheet } = createRegistry();
    (timesheet.execute as jest.Mock).mockResolvedValue({
      success: true,
      content: 'confirmed',
      totalHours: 8,
    });

    const result = await registry.execute({
      conversationId: 'c1',
      turnId: 't1',
      userInput: '住院医生 松江现场支持 8',
      executor: 'local-timesheet',
      capability: 'timesheet',
      intentState,
      params: {
        timesheetAction: 'confirm',
        timesheetDate: '2026-03-10',
        timesheetRawOverride: '住院医生 松江现场支持 8',
      },
    });

    expect(timesheet.execute).toHaveBeenCalledWith({
      action: 'confirm',
      targetDate: '2026-03-10',
      rawOverride: '住院医生 松江现场支持 8',
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('confirmed');
  });
});
