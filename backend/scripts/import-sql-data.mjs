#!/usr/bin/env node
/**
 * 将 /Users/xuhailin/ 下的 Persona.sql、Message.sql、Memory.sql 导入到当前数据库。
 * 规则：以数据库表结构为准，匹配的列更新，SQL 中多出的列忽略，DB 有而 SQL 没有的列保留空/默认。
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const SQL_DIR = '/Users/xuhailin';
const PERSONA_SQL = join(SQL_DIR, 'Persona.sql');
const MESSAGE_SQL = join(SQL_DIR, 'Message.sql');
const MEMORY_SQL = join(SQL_DIR, 'Memory.sql');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run(sql, name = '') {
  try {
    await client.query(sql);
    if (name) console.log(`  OK: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}`, e.message);
    throw e;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set (e.g. in backend/.env)');
    process.exit(1);
  }
  await client.connect();
  console.log('Connected. Importing with DB schema as source of truth (upsert by id).\n');

  try {
    // ----- 1. Persona：SQL 中有 impressionCore/Detail、pendingImpression*，DB 没有，用临时表过滤 -----
    console.log('1. Persona (extra columns in SQL ignored)...');
    await run(`
      CREATE TABLE IF NOT EXISTS "Persona_import" (
        "id" TEXT NOT NULL,
        "evolutionAllowed" TEXT,
        "evolutionForbidden" TEXT,
        "createdAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3),
        "impressionCore" TEXT,
        "impressionDetail" TEXT,
        "isActive" BOOLEAN,
        "version" INTEGER,
        "adaptiveRules" TEXT,
        "behaviorForbidden" TEXT,
        identity TEXT,
        personality TEXT,
        "silencePermission" TEXT,
        "valueBoundary" TEXT,
        "voiceStyle" TEXT,
        "pendingImpressionCore" TEXT,
        "pendingImpressionDetail" TEXT,
        "metaFilterPolicy" TEXT,
        PRIMARY KEY ("id")
      );
    `);
    const personaSql = readFileSync(PERSONA_SQL, 'utf8').replace(
      /INSERT INTO public."Persona" /g,
      'INSERT INTO public."Persona_import" '
    );
    await client.query(personaSql);
    await run(`
      INSERT INTO public."Persona" (
        id, "evolutionAllowed", "evolutionForbidden", "createdAt", "updatedAt",
        "isActive", version, "adaptiveRules", "behaviorForbidden", identity, personality,
        "silencePermission", "valueBoundary", "voiceStyle", "metaFilterPolicy"
      )
      SELECT
        id, "evolutionAllowed", "evolutionForbidden", "createdAt", "updatedAt",
        "isActive", version, "adaptiveRules", "behaviorForbidden", identity, personality,
        "silencePermission", "valueBoundary", "voiceStyle", "metaFilterPolicy"
      FROM public."Persona_import"
      ON CONFLICT (id) DO UPDATE SET
        "evolutionAllowed" = EXCLUDED."evolutionAllowed",
        "evolutionForbidden" = EXCLUDED."evolutionForbidden",
        "createdAt" = EXCLUDED."createdAt",
        "updatedAt" = EXCLUDED."updatedAt",
        "isActive" = EXCLUDED."isActive",
        version = EXCLUDED.version,
        "adaptiveRules" = EXCLUDED."adaptiveRules",
        "behaviorForbidden" = EXCLUDED."behaviorForbidden",
        identity = EXCLUDED.identity,
        personality = EXCLUDED.personality,
        "silencePermission" = EXCLUDED."silencePermission",
        "valueBoundary" = EXCLUDED."valueBoundary",
        "voiceStyle" = EXCLUDED."voiceStyle",
        "metaFilterPolicy" = EXCLUDED."metaFilterPolicy";
    `, 'Persona upsert');
    await run('DROP TABLE IF EXISTS public."Persona_import";', 'Persona_import drop');

    // ----- 2. Message：先补全 Conversation，再导入 Message -----
    console.log('\n2. Message (ensure Conversation exists, then upsert)...');
    const messageSqlContent = readFileSync(MESSAGE_SQL, 'utf8');
    // VALUES ('messageId', 'conversationId', ...) — second quoted UUID is conversationId
    const convIds = new Set();
    const valuesRegex = /VALUES\s*\(\s*'([0-9a-f-]{36})',\s*'([0-9a-f-]{36})'/g;
    let valuesMatch;
    while ((valuesMatch = valuesRegex.exec(messageSqlContent)) !== null) convIds.add(valuesMatch[2]);
    const now = new Date().toISOString();
    for (const cid of convIds) {
      await client.query(
        `INSERT INTO public."Conversation" (id, title, "summarizedAt", "worldState", "createdAt", "updatedAt")
         VALUES ($1, NULL, NULL, NULL, $2::timestamptz, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [cid, now]
      );
    }
    console.log(`  Ensured ${convIds.size} conversation(s).`);
    await run(`
      CREATE TABLE IF NOT EXISTS "Message_import" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "tokenCount" INTEGER,
        PRIMARY KEY ("id")
      );
    `);
    const messageSql = messageSqlContent.replace(/INSERT INTO public."Message" /g, 'INSERT INTO public."Message_import" ');
    await client.query(messageSql);
    await run(`
      INSERT INTO public."Message" (id, "conversationId", role, content, "createdAt", "tokenCount")
      SELECT id, "conversationId", role, content, "createdAt", "tokenCount"
      FROM public."Message_import"
      ON CONFLICT (id) DO UPDATE SET
        "conversationId" = EXCLUDED."conversationId",
        role = EXCLUDED.role,
        content = EXCLUDED.content,
        "createdAt" = EXCLUDED."createdAt",
        "tokenCount" = EXCLUDED."tokenCount";
    `, 'Message upsert');
    await run('DROP TABLE IF EXISTS public."Message_import";', 'Message_import drop');

    // ----- 3. Memory：表结构与 SQL 一致，临时表导入后 upsert -----
    console.log('\n3. Memory (upsert)...');
    await run(`
      CREATE TABLE IF NOT EXISTS "Memory_import" (
        "id" TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        "sourceMessageIds" TEXT[],
        confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "shortSummary" TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        "correctedMemoryId" TEXT,
        "decayScore" DOUBLE PRECISION NOT NULL DEFAULT 1,
        frozen BOOLEAN NOT NULL DEFAULT false,
        "hitCount" INTEGER NOT NULL DEFAULT 0,
        "lastAccessedAt" TIMESTAMP(3) NOT NULL,
        PRIMARY KEY ("id")
      );
    `);
    const memorySql = readFileSync(MEMORY_SQL, 'utf8').replace(
      /INSERT INTO public."Memory" /g,
      'INSERT INTO public."Memory_import" '
    );
    await client.query(memorySql);
    await run(`
      INSERT INTO public."Memory" (
        id, type, content, "sourceMessageIds", confidence, "createdAt", "updatedAt",
        "shortSummary", category, "correctedMemoryId", "decayScore", frozen, "hitCount", "lastAccessedAt"
      )
      SELECT
        id, type, content, "sourceMessageIds", confidence, "createdAt", "updatedAt",
        "shortSummary", category, "correctedMemoryId", "decayScore", frozen, "hitCount", "lastAccessedAt"
      FROM public."Memory_import"
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        content = EXCLUDED.content,
        "sourceMessageIds" = EXCLUDED."sourceMessageIds",
        confidence = EXCLUDED.confidence,
        "createdAt" = EXCLUDED."createdAt",
        "updatedAt" = EXCLUDED."updatedAt",
        "shortSummary" = EXCLUDED."shortSummary",
        category = EXCLUDED.category,
        "correctedMemoryId" = EXCLUDED."correctedMemoryId",
        "decayScore" = EXCLUDED."decayScore",
        frozen = EXCLUDED.frozen,
        "hitCount" = EXCLUDED."hitCount",
        "lastAccessedAt" = EXCLUDED."lastAccessedAt";
    `, 'Memory upsert');
    await run('DROP TABLE IF EXISTS public."Memory_import";', 'Memory_import drop');

    console.log('\nDone. Persona, Message, Memory imported/updated (by id).');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
