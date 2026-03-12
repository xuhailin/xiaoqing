import { type OnModuleInit } from '@nestjs/common';
import { CapabilityRegistry } from './capability-registry.service';
import { WeatherSkillService } from './skills/weather/weather-skill.service';
import { BookDownloadSkillService } from './skills/book-download/book-download-skill.service';
import { GeneralActionSkillService } from './skills/general-action/general-action-skill.service';
import { TimesheetSkillService } from './skills/timesheet/timesheet-skill.service';
import { ReadonlyFileCapabilityService } from './capabilities/readonly-file-capability.service';
export declare class ActionModule implements OnModuleInit {
    private readonly registry;
    private readonly weather;
    private readonly bookDownload;
    private readonly generalAction;
    private readonly timesheet;
    private readonly readonlyFileCapability;
    constructor(registry: CapabilityRegistry, weather: WeatherSkillService, bookDownload: BookDownloadSkillService, generalAction: GeneralActionSkillService, timesheet: TimesheetSkillService, readonlyFileCapability: ReadonlyFileCapabilityService);
    onModuleInit(): void;
}
