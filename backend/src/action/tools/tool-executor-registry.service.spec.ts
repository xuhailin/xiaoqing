import { ToolExecutorRegistry } from './tool-executor-registry.service';
import { CapabilityRegistry } from '../capability-registry.service';
import type { OpenClawService } from '../../openclaw/openclaw.service';
import type { ICapability } from '../capability.interface';
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

function createMockCapability(overrides: Partial<ICapability> = {}): ICapability {
  return {
    name: 'mock',
    taskIntent: 'mock',
    channels: ['chat'],
    description: 'mock',
    surface: 'assistant',
    scope: 'private',
    portability: 'portable',
    requiresAuth: false,
    requiresUserContext: false,
    visibility: 'default',
    isAvailable: jest.fn().mockReturnValue(true),
    execute: jest.fn(),
    ...overrides,
  } as ICapability;
}

describe('ToolExecutorRegistry', () => {
  function createRegistry() {
    const capabilityRegistry = new CapabilityRegistry();

    const generalAction = createMockCapability({
      name: 'general-action',
      taskIntent: 'general_tool',
    });
    const timesheet = createMockCapability({
      name: 'timesheet',
      taskIntent: 'timesheet_submit',
      isAvailable: jest.fn().mockReturnValue(false),
    });

    capabilityRegistry.register(generalAction);
    capabilityRegistry.register(timesheet);

    const openclaw = {
      delegateTask: jest.fn(),
    } as unknown as OpenClawService;

    return {
      registry: new ToolExecutorRegistry(capabilityRegistry, openclaw),
      generalAction,
      timesheet,
    };
  }

  it('returns success with reasonCode meta when local general action succeeds', async () => {
    const { registry, generalAction } = createRegistry();
    (generalAction.execute as jest.Mock).mockResolvedValue({
      success: true,
      content: 'done',
      error: null,
      meta: { reasonCode: 'OK', actionType: 'file.read' },
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

  it('returns fail when capability is not registered', async () => {
    const capabilityRegistry = new CapabilityRegistry();
    const openclaw = { delegateTask: jest.fn() } as unknown as OpenClawService;
    const registry = new ToolExecutorRegistry(capabilityRegistry, openclaw);

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
    expect(result.error).toContain('not registered');
  });
});
