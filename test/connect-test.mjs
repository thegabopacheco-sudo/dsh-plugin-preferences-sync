// Test end-to-end de preferences-sync.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(home, { recursive: true });
const mdFile = path.join(tmpDir, 'PREFERENCIAS.md');
writeFileSync(mdFile, ['# Preferencias', '', '## Idioma y trato', '- **idioma**: español neutro', '- evitar-voseo: sí', '', '## Proyecto', '- **estetica**: negro y rojo', ''].join('\n'), 'utf8');

function makeClient(extraEnv = {}) {
  const entry = process.env.PREFS_SERVER ? path.resolve(process.env.PREFS_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'prefs-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const noConfirm = await client.callTool({ name: 'set', arguments: { key: 'x', value: 'y' } });
console.log('set sin confirm isError:', noConfirm.isError === true);
await client.callTool({ name: 'set', arguments: { key: 'Idioma', value: 'español neutro', category: 'idioma', confirm: true } });
const get = textOf(await client.callTool({ name: 'get', arguments: { key: 'idioma' } }));
console.log('get normaliza clave:', get.includes('idioma = español neutro'));
const imported = textOf(await client.callTool({ name: 'import', arguments: { path: mdFile, confirm: true } }));
console.log('--- import ---'); console.log(imported);
console.log('importa 3:', imported.includes('Importadas 3'));
const language = textOf(await client.callTool({ name: 'get', arguments: { key: 'idioma' } }));
console.log('import actualizó idioma:', language.includes('español neutro'));
const list = textOf(await client.callTool({ name: 'list', arguments: {} }));
console.log('--- list ---'); console.log(list);
console.log('lista categorías:', list.includes('[Idioma y trato]') && list.includes('[Proyecto]'));
const filtered = textOf(await client.callTool({ name: 'list', arguments: { category: 'Idioma y trato' } }));
console.log('filtra categoría:', filtered.includes('idioma') && !filtered.includes('estetica'));
const removed = textOf(await client.callTool({ name: 'remove', arguments: { key: 'evitar-voseo', confirm: true } }));
console.log('remove:', removed.includes('eliminada'));
const noConfirmExport = await client.callTool({ name: 'export', arguments: {} });
console.log('export sin confirm isError:', noConfirmExport.isError === true);
const exported = textOf(await client.callTool({ name: 'export', arguments: { confirm: true } }));
const file = exported.replace('Exportado: ', '').split(' (')[0];
const content = readFileSync(file, 'utf8');
console.log('--- export ---'); console.log(exported);
console.log('md export contiene claves:', content.includes('## Idioma y trato') && content.includes('**idioma**'));
const store = JSON.parse(readFileSync(path.join(home, 'preferences-sync', 'preferences.json'), 'utf8'));
console.log('store persiste:', store.preferences.length === 2);
await client.close(); try { await transport.close?.(); } catch {}
const { client: roClient, transport: roTransport } = await makeClient({ DSH_PREFS_MODE: 'read-only' });
const roSet = await roClient.callTool({ name: 'set', arguments: { key: 'no', value: 'no', confirm: true } });
console.log('read-only set isError:', roSet.isError === true);
await roClient.close(); try { await roTransport.close?.(); } catch {}
console.log('OK');
