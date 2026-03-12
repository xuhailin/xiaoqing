"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DevTranscriptWriter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevTranscriptWriter = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const path_1 = require("path");
let DevTranscriptWriter = DevTranscriptWriter_1 = class DevTranscriptWriter {
    logger = new common_1.Logger(DevTranscriptWriter_1.name);
    async write(runDir, entry) {
        try {
            await (0, promises_1.mkdir)(runDir, { recursive: true });
            const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
            await (0, promises_1.appendFile)((0, path_1.resolve)(runDir, 'transcript.jsonl'), line, 'utf8');
        }
        catch (err) {
            this.logger.warn(`Failed to write transcript: ${err}`);
        }
    }
};
exports.DevTranscriptWriter = DevTranscriptWriter;
exports.DevTranscriptWriter = DevTranscriptWriter = DevTranscriptWriter_1 = __decorate([
    (0, common_1.Injectable)()
], DevTranscriptWriter);
//# sourceMappingURL=dev-transcript.writer.js.map