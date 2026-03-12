"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_USER_INPUT_MAX_CHARS = exports.REPLAN_REASON_MAX_CHARS = exports.GOAL_MAX_CHARS = exports.PREVIEW_LIMIT = exports.MAX_CONSECUTIVE_FAILURES = exports.MAX_AUTO_REPLAN = exports.MAX_PLAN_ROUNDS = exports.MAX_STEPS_PER_ROUND = exports.DEV_AGENT_SKILL_COMMAND_RE = exports.DEV_AGENT_DATA_DIR = void 0;
const path_1 = require("path");
exports.DEV_AGENT_DATA_DIR = (0, path_1.resolve)(__dirname, '../../../data/dev-runs');
exports.DEV_AGENT_SKILL_COMMAND_RE = /^\/skill\s+([a-z0-9-]+)\s*$/;
exports.MAX_STEPS_PER_ROUND = 2;
exports.MAX_PLAN_ROUNDS = 4;
exports.MAX_AUTO_REPLAN = 1;
exports.MAX_CONSECUTIVE_FAILURES = 2;
exports.PREVIEW_LIMIT = 400;
exports.GOAL_MAX_CHARS = 2000;
exports.REPLAN_REASON_MAX_CHARS = 500;
exports.REPORT_USER_INPUT_MAX_CHARS = 1500;
//# sourceMappingURL=dev-agent.constants.js.map