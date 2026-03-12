import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import type { WeatherSkillExecuteParams, WeatherSkillResult } from './weather-skill.types';
export declare class WeatherSkillService implements ICapability {
    private readonly logger;
    private readonly apiKey;
    private readonly baseUrl;
    readonly name = "weather";
    readonly taskIntent = "weather_query";
    readonly channels: MessageChannel[];
    readonly description = "\u67E5\u5929\u6C14\uFF08\u4ECA\u5929/\u660E\u5929/\u540E\u5929\u3001\u67D0\u5730\u5929\u6C14\uFF09";
    constructor(config: ConfigService);
    isAvailable(): boolean;
    private static readonly COORD_REGEX;
    resolveCityToLocation(city: string, district?: string): Promise<string | null>;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    executeWeather(params: WeatherSkillExecuteParams): Promise<WeatherSkillResult>;
    private sanitizeDateLabel;
    private lookupLocationGeo;
    private geoLookup;
    private fetchWeatherNow;
    private formatResult;
    private parseParams;
}
