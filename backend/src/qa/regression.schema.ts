import { z } from 'zod';
import type { RegressionScenario } from './regression.types';

const scenarioTurnSchema = z.object({
  role: z.literal('user'),
  content: z.string().min(1),
}).strict();

const expectationRuleSchema = z.object({
  type: z.string().min(1),
  description: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

const qualityDimensionSchema = z.object({
  dimension: z.string().min(1),
  minScore: z.number().int().min(0).max(5).optional(),
  weight: z.number().min(0).optional(),
}).strict();

const sideEffectExpectationSchema = z.object({
  type: z.string().min(1),
  target: z.string().optional(),
  description: z.string().optional(),
}).strict();

const expectedExecutionSchema = z.object({
  route: z.enum(['chat', 'dev']).optional(),
  capability: z.string().optional(),
  sideEffects: z.array(sideEffectExpectationSchema).optional(),
}).strict();

const scenarioReferenceConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
}).strict();

const scenarioReferenceSchema = z.object({
  sampleAnswer: z.string().optional(),
  notes: z.string().optional(),
  referenceConversation: z.array(scenarioReferenceConversationTurnSchema).optional(),
}).strict();

export const regressionScenarioSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.enum(['curated', 'replay', 'promoted']),
  category: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  releaseGate: z.boolean(),
  gateSuite: z.enum(['core', 'agents']).optional(),
  transcript: z.array(scenarioTurnSchema).min(1),
  expectations: z.object({
    mustHappen: z.array(expectationRuleSchema),
    mustNotHappen: z.array(expectationRuleSchema),
    qualityDimensions: z.array(qualityDimensionSchema).min(1),
    expectedExecution: expectedExecutionSchema.optional(),
  }).strict(),
  reference: scenarioReferenceSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export function parseRegressionScenario(
  raw: unknown,
  filePath: string,
): RegressionScenario {
  return {
    ...regressionScenarioSchema.parse(raw),
    filePath,
  };
}
