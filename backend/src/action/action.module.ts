import { Module, type OnModuleInit } from '@nestjs/common';
import { CapabilityRegistry } from './capability-registry.service';
import { ToolExecutorRegistry } from './tools/tool-executor-registry.service';
import { WeatherSkillModule } from './skills/weather/weather-skill.module';
import { BookDownloadSkillModule } from './skills/book-download/book-download-skill.module';
import { GeneralActionSkillModule } from './skills/general-action/general-action-skill.module';
import { TimesheetSkillModule } from './skills/timesheet/timesheet-skill.module';
import { WeatherSkillService } from './skills/weather/weather-skill.service';
import { BookDownloadSkillService } from './skills/book-download/book-download-skill.service';
import { GeneralActionSkillService } from './skills/general-action/general-action-skill.service';
import { TimesheetSkillService } from './skills/timesheet/timesheet-skill.service';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { ReadonlyFileCapabilityService } from './capabilities/readonly-file-capability.service';
import { LocalSkillModule } from './local-skills/local-skill.module';
import { SkillRunner } from './local-skills/skill-runner.service';

/**
 * ActionModule — 能力注册中心。
 *
 * 职责：
 * 1. 提供 CapabilityRegistry（全局单例）
 * 2. 在 onModuleInit 时将所有 skill 注册到 registry
 * 3. 提供 ToolExecutorRegistry（向后兼容层）
 *
 * 新增能力时只需：
 * 1. 创建 skill service 实现 ICapability
 * 2. 在此模块 imports 中加入对应 SkillModule
 * 3. 在 onModuleInit() 中 register 一行
 *
 * 能力实现的上下文边界（例如禁止在 capability 内通过 conversationId 访问 Message/Memory/Claim/Profile）
 * 见 docs/context-boundary.md。
 */
@Module({
  imports: [
    WeatherSkillModule,
    BookDownloadSkillModule,
    GeneralActionSkillModule,
    TimesheetSkillModule,
    LocalSkillModule,
    OpenClawModule,
  ],
  providers: [CapabilityRegistry, ToolExecutorRegistry, ReadonlyFileCapabilityService, SkillRunner],
  exports: [CapabilityRegistry, ToolExecutorRegistry, WeatherSkillModule, LocalSkillModule, SkillRunner],
})
export class ActionModule implements OnModuleInit {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly weather: WeatherSkillService,
    private readonly bookDownload: BookDownloadSkillService,
    private readonly generalAction: GeneralActionSkillService,
    private readonly timesheet: TimesheetSkillService,
    private readonly readonlyFileCapability: ReadonlyFileCapabilityService,
  ) {}

  onModuleInit() {
    this.registry.register(this.weather);
    this.registry.register(this.bookDownload);
    this.registry.register(this.generalAction);
    this.registry.register(this.timesheet);
    this.registry.register(this.readonlyFileCapability);
  }
}
