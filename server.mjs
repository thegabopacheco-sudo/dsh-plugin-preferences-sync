#!/usr/bin/env node
// dsh-plugin-preferences-sync — hub de preferencias del harness.
// Tools: status, list, get, set, remove, import, export.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const STORE_FILE = path.join(DSH_HOME, 'preferences-sync', 'preferences.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'preferences-sync');
const CONFIG_FILE = path.join(DSH_HOME, 'preferences-sync', 'config.json');
const READ_ONLY = String(process.env.DSH_PREFS_MODE || '').toLowerCase() === 'read-only';
const log = (m) => process.stderr.write(`[prefs] ${m}\n`);

function loadConfig() {
  try { if (existsSync(CONFIG_FILE)) return { preferencesFile: null, ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ }
  return { preferencesFile: null };
}
function load() {
  try { if (existsSync(STORE_FILE)) { const data = JSON.parse(readFileSync(STORE_FILE, 'utf8')) || {}; return { preferences: Array.isArray(data.preferences) ? data.preferences : [] }; } } catch { /* reset */ }
  return { preferences: [] };
}
function save(data) { mkdirSync(path.dirname(STORE_FILE), { recursive: true }); writeFileSync(STORE_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8'); }
function normalizeKey(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
  if (!key) throw new Error('key inválida');
  return key;
}
function parseMarkdownPreferences(text) {
  const elements = [];
  let category = 'general';
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) { category = heading[1].trim(); continue; }
    const bullet = line.match(/^\s*[-*]\s+(?:\*\*([^*]+)\*\*|([^:]+)):\s*(.+)$/);
    if (bullet) {
      const key = normalizeKey(bullet[1] || bullet[2]);
      const value = bullet[3].trim();
      if (value && !/^---/.test(value)) elements.push({ key, value, category });
    }
  }
  return elements;
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }
function uniquePath(target) {
  if (!existsSync(target)) return target;
  const parsed = path.parse(target);
  for (let index = 1; index < 1000; index++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error('no se pudo generar nombre único');
}

function buildInstructions() {
  return [
    'Preferences Sync: fuente única de preferencias del harness.',
    '',
    `Store: ${STORE_FILE}`,
    '',
    'Herramientas: status, list, get, set, remove, import, export.',
    '',
    'Reglas:',
    '- set/remove/import/export requieren confirm:true y pedido explícito.',
    '- import lee un Markdown con encabezados y bullets "clave: valor"; no inventa preferencias.',
    '- export escribe Markdown en la caché del plugin y nunca sobrescribe.',
    '- No guardes contraseñas ni tokens como preferencias.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-preferences-sync', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });

  server.registerTool(
    'status',
    { title: 'Estado', description: 'Cantidad de preferencias, archivo externo y modo.', inputSchema: z.object({}) },
    async () => {
      const data = load();
      const external = loadConfig().preferencesFile;
      return textResult([`Preferencias: ${data.preferences.length}`, `Archivo externo: ${external || '(no configurado)'}${external && existsSync(external) ? ' ✅' : ''}`, `Store: ${STORE_FILE}`, `Modo: ${READ_ONLY ? 'read-only' : 'normal'}`].join('\n'));
    },
  );

  server.registerTool(
    'list',
    { title: 'Listar preferencias', description: 'Lista por categoría.', inputSchema: z.object({ category: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }) },
    async (args) => {
      let preferences = load().preferences;
      if (args.category) preferences = preferences.filter((preference) => preference.category.toLowerCase() === args.category.toLowerCase());
      preferences = preferences.slice(0, args.limit ?? 200);
      if (preferences.length === 0) return textResult('Sin preferencias guardadas.');
      return textResult(preferences.map((preference) => `[${preference.category}] ${preference.key} = ${preference.value}`).join('\n'));
    },
  );

  server.registerTool(
    'get',
    { title: 'Obtener preferencia', description: 'Devuelve el valor de una clave.', inputSchema: z.object({ key: z.string().min(1) }) },
    async (args) => {
      const key = normalizeKey(args.key);
      const preference = load().preferences.find((item) => item.key === key);
      if (!preference) throw new Error(`preferencia no encontrada: ${key}`);
      return textResult(`[${preference.category}] ${preference.key} = ${preference.value}`);
    },
  );

  server.registerTool(
    'set',
    { title: 'Definir preferencia', description: 'Crea o actualiza una preferencia. Requiere confirm:true.', inputSchema: z.object({ key: z.string().min(1).max(80), value: z.string().min(1).max(2000), category: z.string().max(60).optional(), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: set deshabilitado');
      if (args.confirm !== true) throw new Error('set requiere confirm:true y confirmación explícita');
      const key = normalizeKey(args.key);
      const data = load();
      const existing = data.preferences.find((item) => item.key === key);
      if (existing) { existing.value = args.value; existing.category = args.category || existing.category; existing.updatedAt = new Date().toISOString(); }
      else data.preferences.push({ key, value: args.value, category: args.category || 'general', updatedAt: new Date().toISOString() });
      save(data);
      return textResult(`Preferencia ${existing ? 'actualizada' : 'creada'}: ${key}`);
    },
  );

  server.registerTool(
    'remove',
    { title: 'Eliminar preferencia', description: 'Elimina una clave. Requiere confirm:true.', inputSchema: z.object({ key: z.string().min(1), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: remove deshabilitado');
      if (args.confirm !== true) throw new Error('remove requiere confirm:true');
      const key = normalizeKey(args.key);
      const data = load();
      const before = data.preferences.length;
      data.preferences = data.preferences.filter((item) => item.key !== key);
      if (data.preferences.length === before) throw new Error(`preferencia no encontrada: ${key}`);
      save(data);
      return textResult(`Preferencia eliminada: ${key}`);
    },
  );

  server.registerTool(
    'import',
    { title: 'Importar Markdown', description: 'Importa preferencias desde un .md. Requiere confirm:true.', inputSchema: z.object({ path: z.string().optional(), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: import deshabilitado');
      if (args.confirm !== true) throw new Error('import requiere confirm:true');
      const file = args.path || loadConfig().preferencesFile;
      if (!file) throw new Error('no hay archivo configurado; pasa path');
      if (!existsSync(file)) throw new Error(`archivo no encontrado: ${file}`);
      const elements = parseMarkdownPreferences(readFileSync(file, 'utf8'));
      if (elements.length === 0) return textResult('No se encontraron preferencias con formato "clave: valor".');
      const data = load();
      let imported = 0;
      for (const element of elements) {
        const existing = data.preferences.find((item) => item.key === element.key);
        if (existing) { existing.value = element.value; existing.category = element.category; existing.updatedAt = new Date().toISOString(); }
        else data.preferences.push({ ...element, updatedAt: new Date().toISOString() });
        imported++;
      }
      save(data);
      return textResult(`Importadas ${imported} preferencias desde ${file}.`);
    },
  );

  server.registerTool(
    'export',
    { title: 'Exportar Markdown', description: 'Exporta las preferencias a Markdown. Requiere confirm:true.', inputSchema: z.object({ output: z.string().optional(), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: export deshabilitado');
      if (args.confirm !== true) throw new Error('export requiere confirm:true');
      const data = load();
      const categories = [...new Set(data.preferences.map((preference) => preference.category))];
      const lines = ['# Preferencias (generado por Preferences Sync)', ''];
      for (const category of categories) {
        lines.push(`## ${category}`, '');
        for (const preference of data.preferences.filter((item) => item.category === category)) lines.push(`- **${preference.key}**: ${preference.value}`);
        lines.push('');
      }
      const target = args.output ? path.resolve(args.output) : path.join(CACHE_DIR, 'PREFERENCIAS.md');
      mkdirSync(path.dirname(target), { recursive: true });
      const file = uniquePath(target);
      writeFileSync(file, lines.join('\n'), 'utf8');
      return textResult(`Exportado: ${file} (${data.preferences.length} preferencias)`);
    },
  );

  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log(`store: ${STORE_FILE} · modo: ${READ_ONLY ? 'read-only' : 'normal'}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
