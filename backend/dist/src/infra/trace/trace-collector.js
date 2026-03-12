"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceCollector = void 0;
class TraceCollector {
    steps = [];
    seq = 0;
    enabled;
    constructor(enabled) {
        this.enabled = enabled;
    }
    add(label, title, status, detail) {
        if (!this.enabled)
            return;
        this.steps.push({
            seq: ++this.seq,
            label,
            title,
            durationMs: 0,
            status,
            detail,
        });
    }
    async wrap(label, title, fn) {
        if (!this.enabled) {
            const { result } = await fn();
            return result;
        }
        const start = Date.now();
        const { status, detail, result } = await fn();
        this.steps.push({
            seq: ++this.seq,
            label,
            title,
            durationMs: Date.now() - start,
            status,
            detail,
        });
        return result;
    }
    getTrace() {
        return this.steps;
    }
}
exports.TraceCollector = TraceCollector;
//# sourceMappingURL=trace-collector.js.map