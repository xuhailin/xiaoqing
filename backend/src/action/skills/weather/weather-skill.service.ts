import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import type { WeatherSkillExecuteParams, WeatherSkillResult } from './weather-skill.types';

/** 和风天气 Geo 城市搜索结果（含经纬度） */
interface QWeatherLocation {
  name: string;
  id: string;
  lat?: string;
  lon?: string;
  adm2?: string;
  adm1?: string;
  country?: string;
}

/** 和风天气实时天气 now */
interface QWeatherNow {
  temp: string;
  feelsLike: string;
  text: string;
  windDir: string;
  windScale: string;
  windSpeed: string;
  humidity: string;
  obsTime?: string;
}

@Injectable()
export class WeatherSkillService implements ICapability {
  private readonly logger = new Logger(WeatherSkillService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  // ── ICapability 元数据 ──────────────────────────────────
  readonly name = 'weather';
  readonly taskIntent = 'weather_query';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '查天气（今天/明天/后天、某地天气）';
  readonly surface = 'assistant' as const;
  readonly scope = 'public' as const;
  readonly portability = 'config-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = false;
  readonly visibility = 'default' as const;

  constructor(config: ConfigService) {
    this.apiKey = config.get('QWEATHER_API_KEY') || '';
    const url = (config.get('QWEATHER_BASE_URL') || '').replace(/\/$/, '');
    this.baseUrl = url || 'https://devapi.qweather.com';
  }

  /** 是否已配置 KEY，未配置则不可用，上层可 fallback 到 OpenClaw */
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /** 坐标格式：经度,纬度（和风 API 约定，小数位数不限） */
  private static readonly COORD_REGEX = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;

  /**
   * 将城市名（+ 区县）解析为坐标 "经度,纬度"，供策略层在仅有 city 时调用。
   */
  async resolveCityToLocation(city: string, district?: string): Promise<string | null> {
    if (!this.apiKey) return null;
    const cityRaw = String(city ?? '').trim();
    if (!cityRaw || cityRaw.length > 40) return null;
    const loc = await this.lookupLocationGeo(cityRaw, district ? String(district).trim() : undefined);
    if (!loc || loc.lon == null || loc.lat == null) return null;
    return `${loc.lon},${loc.lat}`;
  }

  // ── ICapability.execute — 统一入口 ─────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const adapted = this.parseParams(request.params);
    if (!adapted) {
      return { success: false, content: null, error: 'weather params invalid' };
    }
    const result = await this.executeWeather(adapted);
    return { success: result.success, content: result.content || null, error: result.error ?? null };
  }

  /**
   * 执行天气查询：仅接收坐标 location，调用和风 API，返回统一结果字符串供小晴转述。
   * 保留供 ToolExecutorRegistry 直接调用（Phase 1.7 后将只通过 ICapability.execute 调用）。
   */
  async executeWeather(params: WeatherSkillExecuteParams): Promise<WeatherSkillResult> {
    if (!this.apiKey) {
      this.logger.debug('Weather skill skipped: QWEATHER_API_KEY not set');
      return { success: false, content: '', error: '天气服务未配置' };
    }

    const locationRaw = String(params.location ?? '').trim();
    if (!locationRaw) {
      return { success: false, content: '', error: '缺少地点参数（坐标）' };
    }
    if (!WeatherSkillService.COORD_REGEX.test(locationRaw)) {
      return { success: false, content: '', error: '地点参数格式应为 经度,纬度' };
    }

    try {
      const now = await this.fetchWeatherNow(locationRaw);
      if (!now) {
        return { success: false, content: '', error: '获取天气数据失败' };
      }
      const dateLabel = this.sanitizeDateLabel(params.dateLabel);
      const displayName = params.displayName ?? '该坐标';
      const content = this.formatResult(displayName, dateLabel, now);
      return { success: true, content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Weather skill execute error: ${msg}`);
      return { success: false, content: '', error: msg };
    }
  }

  private sanitizeDateLabel(input?: string): string {
    if (!input) return '当前';
    if (input === '今天' || input === '明天' || input === '后天' || input === '当前') {
      return input;
    }
    return '当前';
  }

  /**
   * 和风 geo 城市/地区查询，返回第一条结果的经纬度（用于拼坐标）。
   * district 存在时：location=区县, adm=上级城市（精确查）；失败则 fallback 到仅城市查询。
   */
  private async lookupLocationGeo(city: string, district?: string): Promise<QWeatherLocation | null> {
    // 有区县时：location=区县, adm=城市（上级行政区划）
    if (district) {
      const loc = await this.geoLookup(district, city);
      if (loc) return loc;
      this.logger.debug(`District lookup failed for "${district}" (adm="${city}"), falling back to city-only`);
    }
    // fallback：仅按城市查
    return this.geoLookup(city);
  }

  private async geoLookup(location: string, adm?: string): Promise<QWeatherLocation | null> {
    const params = new URLSearchParams();
    params.set('location', location);
    if (adm) params.set('adm', adm);
    params.set('number', '1');
    const url = `${this.baseUrl}/geo/v2/city/lookup?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-QW-Api-Key': this.apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Geo lookup failed: HTTP ${res.status} for "${location}" (adm="${adm ?? ''}"): ${body.slice(0, 300)}`);
      return null;
    }
    const data = (await res.json()) as { code?: string; location?: QWeatherLocation[] };
    if (data.code !== '200' || !Array.isArray(data.location) || data.location.length === 0) {
      this.logger.warn(`Geo lookup empty: code=${data.code}, location="${location}", adm="${adm ?? ''}"`);
      return null;
    }
    return data.location[0];
  }

  private async fetchWeatherNow(location: string): Promise<QWeatherNow | null> {
    const url = `${this.baseUrl}/v7/weather/now?location=${encodeURIComponent(location)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-QW-Api-Key': this.apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Weather now failed: HTTP ${res.status} for location="${location}": ${body.slice(0, 300)}`);
      return null;
    }
    const data = (await res.json()) as { code?: string; now?: QWeatherNow };
    if (data.code !== '200' || !data.now) {
      this.logger.warn(`Weather now bad response: code=${data.code}, location="${location}"`);
      return null;
    }
    return data.now;
  }

  private formatResult(city: string, dateLabel: string, now: QWeatherNow): string {
    const parts = [
      `${city}${dateLabel}：${now.text}`,
      `气温 ${now.temp}°C`,
      now.feelsLike ? `体感 ${now.feelsLike}°C` : '',
      now.humidity ? `湿度 ${now.humidity}%` : '',
      now.windDir || now.windScale ? `${now.windDir || ''} ${now.windScale || ''}级`.trim() : '',
      now.windSpeed ? `风速 ${now.windSpeed} km/h` : '',
    ].filter(Boolean);
    return parts.join('，');
  }

  private parseParams(params: Record<string, unknown>): WeatherSkillExecuteParams | null {
    const location = typeof params.location === 'string' ? params.location.trim() : '';
    if (!location) return null;
    const dateLabel = typeof params.dateLabel === 'string' ? params.dateLabel : undefined;
    const displayName = typeof params.displayName === 'string' ? params.displayName : undefined;
    return { location, dateLabel, displayName };
  }
}
