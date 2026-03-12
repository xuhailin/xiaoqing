"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimesheetConfig = getTimesheetConfig;
exports.loadProjectMappings = loadProjectMappings;
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
function getTimesheetConfig(env = process.env) {
    return {
        oaBaseUrl: env.TIMESHEET_OA_URL ?? 'https://oa.synyi.com/wui/index.html',
        workflowEntryUrl: env.TIMESHEET_WORKFLOW_ENTRY_URL
            ?? 'https://oa.synyi.com/wui/index.html?#/main/workflow/add?menuIds=1,12&menuPathIds=1,12&_key=st9cdo',
        siteKey: 'synyi-oa',
        sessionDir: env.RESOURCE_SESSION_DIR ?? '.sessions',
        loginId: env.TIMESHEET_LOGIN_ID ?? '',
        password: env.TIMESHEET_PASSWORD ?? '',
        projectsConfigPath: env.TIMESHEET_PROJECTS_CONFIG ?? 'config/timesheet-projects.json',
        gitAuthor: env.TIMESHEET_GIT_AUTHOR ?? '',
        screenshotDir: env.TIMESHEET_SCREENSHOT_DIR ?? 'assets/timesheet-debug',
        timeoutMs: Number(env.TIMESHEET_TIMEOUT_MS) || 15000,
        headless: env.LOCAL_ACTION_BROWSER_HEADLESS !== 'false',
    };
}
function loadProjectMappings(configPath) {
    const resolved = path.isAbsolute(configPath)
        ? configPath
        : path.join(process.cwd(), configPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`工时项目映射配置文件不存在: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error('工时项目映射配置应为 JSON 数组');
    }
    return parsed;
}
//# sourceMappingURL=timesheet.config.js.map