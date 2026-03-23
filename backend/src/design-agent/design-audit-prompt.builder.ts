import { Injectable } from '@nestjs/common';
import type { DesignAuditRequest, DesignKnowledge } from './design-agent.types';

/**
 * 构建设计审查 prompt。
 *
 * 将 design knowledge（rules/tokens/preset）和审查目标打包成一个
 * 高约束的 prompt，交给 Claude Code agent 执行。
 * Claude Code 会使用 Read/Glob 工具读取目标文件，按注入的规则审查。
 */
@Injectable()
export class DesignAuditPromptBuilder {
  build(request: DesignAuditRequest, knowledge: DesignKnowledge): string {
    const targetFilesSection = this.buildTargetFilesSection(request);
    const outputSchema = this.buildOutputSchema();

    return `# Design Audit Task

You are the DesignAuditor for XiaoQing. Your job is to audit the "${request.pageName}" page for design system consistency. You must NOT invent new design standards — only use the rules provided below.

## Design System Knowledge

### Core UI Rules
${knowledge.coreRules}

---

### Page Type Patterns
${knowledge.pageTypePatterns}

---

### Theme Tokens
${knowledge.themeTokens}

---

### Shared UI Primitives
${knowledge.sharedPrimitives}

---

### Active Preset: ${knowledge.presetName}
${knowledge.preset}

---

## Audit Instructions

**Page under audit:** ${request.pageName}
**Page type:** ${request.pageType}
**Preset:** ${knowledge.presetName}
${request.notes ? `**Notes from requester:** ${request.notes}` : ''}

${targetFilesSection}

## What to do

1. Read the target files using your Read/Glob tools.
2. Also read these files for actual token values:
   - frontend/src/styles/_variables.scss
   - frontend/src/styles/_design-system.scss
3. The Shared UI Primitives section above already lists all available components — use it as reference, no need to read those component files.
4. Analyze the page files against the Core UI Rules, Shared Primitives, and the active preset above.
5. Identify actual rule violations — not aesthetic preferences.
6. Output ONLY the JSON result below, with no extra text before or after.

## Output Format

Output a single JSON object matching this exact schema:

${outputSchema}

## Hard Constraints

- status must be one of: "pass" | "needs_refine" | "needs_structure_change" | "blocked"
- findings.severity must be one of: "high" | "medium" | "low"
- findings must reference specific files and rule names from the rules above
- minimalFixPlan entries must be small, targeted changes — not full rewrites
- noChangeZones must list parts of the page that should NOT be touched
- nextAction.recommendedTask must be "refine" if findings exist, "none" if status is "pass"
- If you cannot read the files, set status to "blocked" and explain in overallAssessment
- Output valid JSON only — no markdown code fences, no extra commentary`;
  }

  private buildTargetFilesSection(request: DesignAuditRequest): string {
    if (request.targetFiles && request.targetFiles.length > 0) {
      return `**Files to audit (read these first):**
${request.targetFiles.map((f) => `- ${f}`).join('\n')}`;
    }

    return `**Auto-discover files:** Search for the "${request.pageName}" component in frontend/src/app/. Look for files matching the page name (e.g., *${request.pageName}*.component.ts, *${request.pageName}*.component.html, *${request.pageName}*.component.scss).`;
  }

  private buildOutputSchema(): string {
    return JSON.stringify(
      {
        schemaVersion: 1,
        task: 'audit_result',
        page: {
          name: '<page name>',
          pageType: '<chat | workbench | memory>',
          preset: '<warm-tech | serious-workbench | quiet-personal>',
        },
        summary: {
          status: '<pass | needs_refine | needs_structure_change | blocked>',
          riskLevel: '<low | medium | high>',
          overallAssessment: '<3 sentences max describing the overall state>',
        },
        findings: [
          {
            id: '<unique-id-001>',
            rule: '<rule name from core-ui-rules.md>',
            severity: '<high | medium | low>',
            location: '<file path>',
            problem: '<what is wrong>',
            impact: '<why this breaks consistency>',
            evidence: '<optional: specific code or class name>',
          },
        ],
        minimalFixPlan: [
          {
            action: '<what to change>',
            target: '<file path>',
            type: '<token-reuse | layout-adjust | class-remove | component-replace>',
            dependsOn: ['<optional: other files this change needs>'],
          },
        ],
        noChangeZones: ['<description of areas that must not be touched>'],
        primitiveMapping: {
          preferredTokens: ['--token-name'],
          preferredPrimitives: ['AppPanel', 'AppPageHeader', 'AppBadge', 'AppButton'],
        },
        nextAction: {
          recommendedTask: '<refine | none>',
          changeBudget: '<minimal | medium>',
          handoffPrompt: '<short instruction for the next refine task>',
        },
      },
      null,
      2,
    );
  }
}
