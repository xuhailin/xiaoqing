"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPO_SUMMARY_SKILL = void 0;
const PREVIEW_LIMIT = 8;
function findStep(steps, id) {
    return steps.find((step) => step.id === id);
}
function getObjectMeta(step) {
    if (!step?.meta || typeof step.meta !== 'object')
        return {};
    return step.meta;
}
function buildRepoSummary(steps, success) {
    const readmeExistsStep = findStep(steps, 'readme-exists');
    const readReadmeStep = findStep(steps, 'read-readme');
    const readPackageStep = findStep(steps, 'read-package-json');
    const listSrcStep = findStep(steps, 'list-src-root');
    const readmeExistsMeta = getObjectMeta(readmeExistsStep);
    const readReadmeMeta = getObjectMeta(readReadmeStep);
    const listSrcMeta = getObjectMeta(listSrcStep);
    const readmeExists = typeof readmeExistsMeta.exists === 'boolean'
        ? readmeExistsMeta.exists
        : readmeExistsStep?.content === 'true';
    const readmeLength = typeof readReadmeMeta.bytes === 'number'
        ? readReadmeMeta.bytes
        : (readReadmeStep?.content?.length ?? 0);
    let packageSummary = 'package.json 解析失败';
    if (readPackageStep?.success && readPackageStep.content) {
        try {
            const pkg = JSON.parse(readPackageStep.content);
            const name = typeof pkg.name === 'string' && pkg.name.trim()
                ? pkg.name.trim()
                : '(no-name)';
            const version = typeof pkg.version === 'string' && pkg.version.trim()
                ? pkg.version.trim()
                : '(no-version)';
            const scripts = pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
                ? Object.keys(pkg.scripts)
                : [];
            packageSummary = `name=${name}, version=${version}, scripts=${scripts.length}`;
        }
        catch {
            packageSummary = 'package.json 不是有效 JSON';
        }
    }
    const entriesRaw = Array.isArray(listSrcMeta.entries)
        ? listSrcMeta.entries.filter((item) => typeof item === 'string')
        : [];
    const srcCount = entriesRaw.length;
    const srcPreview = entriesRaw.slice(0, PREVIEW_LIMIT).join(', ') || '(empty)';
    const lines = [
        `Skill repo-summary: ${success ? 'success' : 'failed'}`,
        `README: ${readmeExists ? `exists, ${readmeLength} chars` : 'not found'}`,
        `package.json: ${packageSummary}`,
        `src/: ${srcCount} entries, preview: ${srcPreview}`,
    ];
    if (!success) {
        const failedStep = steps.find((step) => !step.success);
        if (failedStep) {
            lines.push(`Failed at step ${failedStep.index} (${failedStep.id}): ${failedStep.error ?? 'unknown error'}`);
        }
    }
    return lines.join('\n');
}
exports.REPO_SUMMARY_SKILL = {
    name: 'repo-summary',
    description: 'Read-only repository summary for README/package/src top-level overview.',
    capabilityAllowlist: ['readonly-file'],
    steps: [
        {
            id: 'readme-exists',
            capability: 'readonly-file',
            request: { action: 'exists', path: 'README.md' },
        },
        {
            id: 'read-readme',
            capability: 'readonly-file',
            request: { action: 'read', path: 'README.md' },
        },
        {
            id: 'read-package-json',
            capability: 'readonly-file',
            request: { action: 'read', path: 'package.json' },
        },
        {
            id: 'list-src-root',
            capability: 'readonly-file',
            request: { action: 'list', path: 'src/' },
        },
    ],
    summarize: ({ steps, success }) => buildRepoSummary(steps, success),
};
//# sourceMappingURL=repo-summary.skill.js.map