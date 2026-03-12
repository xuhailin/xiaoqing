"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var WeatherSkillService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherSkillService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let WeatherSkillService = class WeatherSkillService {
    static { WeatherSkillService_1 = this; }
    logger = new common_1.Logger(WeatherSkillService_1.name);
    apiKey;
    baseUrl;
    name = 'weather';
    taskIntent = 'weather_query';
    channels = ['chat'];
    description = '查天气（今天/明天/后天、某地天气）';
    constructor(config) {
        this.apiKey = config.get('QWEATHER_API_KEY') || '';
        const url = (config.get('QWEATHER_BASE_URL') || '').replace(/\/$/, '');
        this.baseUrl = url || 'https://devapi.qweather.com';
    }
    isAvailable() {
        return Boolean(this.apiKey);
    }
    static COORD_REGEX = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
    async resolveCityToLocation(city, district) {
        if (!this.apiKey)
            return null;
        const cityRaw = String(city ?? '').trim();
        if (!cityRaw || cityRaw.length > 40)
            return null;
        const loc = await this.lookupLocationGeo(cityRaw, district ? String(district).trim() : undefined);
        if (!loc || loc.lon == null || loc.lat == null)
            return null;
        return `${loc.lon},${loc.lat}`;
    }
    async execute(request) {
        const adapted = this.parseParams(request.params);
        if (!adapted) {
            return { success: false, content: null, error: 'weather params invalid' };
        }
        const result = await this.executeWeather(adapted);
        return { success: result.success, content: result.content || null, error: result.error ?? null };
    }
    async executeWeather(params) {
        if (!this.apiKey) {
            this.logger.debug('Weather skill skipped: QWEATHER_API_KEY not set');
            return { success: false, content: '', error: '天气服务未配置' };
        }
        const locationRaw = String(params.location ?? '').trim();
        if (!locationRaw) {
            return { success: false, content: '', error: '缺少地点参数（坐标）' };
        }
        if (!WeatherSkillService_1.COORD_REGEX.test(locationRaw)) {
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Weather skill execute error: ${msg}`);
            return { success: false, content: '', error: msg };
        }
    }
    sanitizeDateLabel(input) {
        if (!input)
            return '当前';
        if (input === '今天' || input === '明天' || input === '后天' || input === '当前') {
            return input;
        }
        return '当前';
    }
    async lookupLocationGeo(city, district) {
        if (district) {
            const loc = await this.geoLookup(district, city);
            if (loc)
                return loc;
            this.logger.debug(`District lookup failed for "${district}" (adm="${city}"), falling back to city-only`);
        }
        return this.geoLookup(city);
    }
    async geoLookup(location, adm) {
        const params = new URLSearchParams();
        params.set('location', location);
        if (adm)
            params.set('adm', adm);
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
        const data = (await res.json());
        if (data.code !== '200' || !Array.isArray(data.location) || data.location.length === 0) {
            this.logger.warn(`Geo lookup empty: code=${data.code}, location="${location}", adm="${adm ?? ''}"`);
            return null;
        }
        return data.location[0];
    }
    async fetchWeatherNow(location) {
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
        const data = (await res.json());
        if (data.code !== '200' || !data.now) {
            this.logger.warn(`Weather now bad response: code=${data.code}, location="${location}"`);
            return null;
        }
        return data.now;
    }
    formatResult(city, dateLabel, now) {
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
    parseParams(params) {
        const location = typeof params.location === 'string' ? params.location.trim() : '';
        if (!location)
            return null;
        const dateLabel = typeof params.dateLabel === 'string' ? params.dateLabel : undefined;
        const displayName = typeof params.displayName === 'string' ? params.displayName : undefined;
        return { location, dateLabel, displayName };
    }
};
exports.WeatherSkillService = WeatherSkillService;
exports.WeatherSkillService = WeatherSkillService = WeatherSkillService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WeatherSkillService);
//# sourceMappingURL=weather-skill.service.js.map