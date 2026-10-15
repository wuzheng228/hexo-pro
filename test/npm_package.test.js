'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { createHermesConfig } = require('../mcp_config');
const { getHeadlessScriptPath } = require('../agent/runtime-manager');
const registerMcpApi = require('../mcp_api');

const packageDir = path.resolve(__dirname, '..');
const metadata = require('../package.json');

test('published package includes its CLI, agent modules, backend and UI without development files', () => {
  const output = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDir, encoding: 'utf8' });
  const [pack] = JSON.parse(output);
  const files = new Set(pack.files.map(file => file.path));
  for (const file of [metadata.main, ...Object.values(metadata.bin), 'agent/client.js',
    'agent/tools.js', 'agent/base-url-resolver.js', 'agent/runtime-manager.js',
    'mcp_config.js', 'headless_server.js', 'www/index.html', 'docs/head.png']) {
    assert.ok(files.has(file), `Missing runtime file: ${file}`);
  }
  assert.ok(pack.files.some(file => /^www\/static\/js\/.+\.js$/.test(file.path)));
  assert.ok(pack.files.some(file => /^www\/static\/css\/.+\.css$/.test(file.path)));
  for (const file of files) {
    assert.ok(!file.endsWith('.map'), `Source map included: ${file}`);
    assert.ok(!/^(test\/|debug\.js$|\.tool-versions$|\.env|data\/|node_modules\/)/.test(file),
      `Development or local file included: ${file}`);
  }
});

test('standalone MCP configuration launches the packaged CLI and exposes the supplied blog and token', () => {
  const config = createHermesConfig({ baseDir: '/tmp/my-blog', token: 'test-token' });
  assert.deepEqual(config, {
    mcpServers: {
      'hexo-pro': {
        command: 'node',
        args: [path.join(packageDir, metadata.bin['hexo-pro-mcp'])],
        env: { HEXOPRO_BASE_DIR: '/tmp/my-blog', HEXO_PRO_MCP_TOKEN: 'test-token' }
      }
    }
  });
  assert.equal(getHeadlessScriptPath(), path.join(packageDir, 'headless_server.js'));
});

test('MCP configuration supports a monorepo CLI and a desktop backend without a CLI', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hexopro-mcp-layout-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const coreDir = path.join(fixture, 'hexo-pro');
  fs.mkdirSync(path.join(fixture, 'bin'), { recursive: true });
  const legacyScript = path.join(fixture, 'bin', 'hexo-pro-mcp.mjs');
  fs.writeFileSync(legacyScript, '');
  const monorepo = createHermesConfig({ baseDir: '/tmp/blog', packageDir: coreDir });
  assert.deepEqual(monorepo.mcpServers['hexo-pro'].args, [legacyScript]);

  fs.rmSync(legacyScript);
  const desktop = createHermesConfig({ baseDir: '/tmp/blog', packageDir: coreDir });
  assert.deepEqual(desktop.mcpServers['hexo-pro'], {
    command: 'npx',
    args: ['--yes', '--package', `hexo-pro@${metadata.version}`, 'hexo-pro-mcp'],
    env: { HEXOPRO_BASE_DIR: '/tmp/blog', HEXO_PRO_MCP_TOKEN: '<paste-token-here>' }
  });
});

test('MCP status and enable endpoints return usable configurations without leaking the persisted token hash', async () => {
  const handlers = {};
  let settings;
  const settingsDb = {
    findOne(query, callback) { callback(null, settings || null); },
    insert(document, callback) { settings = document; callback(null, document); }
  };
  const hexo = { base_dir: '/tmp/blog' };
  registerMcpApi(null, hexo, (route, handler) => { handlers[route] = handler; }, { settingsDb });
  const invoke = async (route, request) => {
    let payload;
    await handlers[route](request, {
      done(result) { payload = result; },
      send(status, message) { assert.fail(`Unexpected API error ${status}: ${message}`); }
    });
    return payload;
  };
  const status = await invoke('mcp/status', { method: 'GET' });
  assert.equal(status.code, 0);
  assert.equal(status.data.enabled, false);
  assert.equal(status.data.hermesConfig.mcpServers['hexo-pro'].env.HEXO_PRO_MCP_TOKEN, '<paste-token-here>');

  const enabled = await invoke('mcp/enable', { method: 'POST', body: { scopes: ['read'] } });
  assert.equal(enabled.code, 0);
  assert.equal(enabled.data.enabled, true);
  assert.deepEqual(enabled.data.scopes, ['read']);
  assert.match(enabled.data.token, /^hxp_mcp_/);
  assert.equal(enabled.data.hermesConfig.mcpServers['hexo-pro'].env.HEXO_PRO_MCP_TOKEN, enabled.data.token);
  assert.equal(enabled.data.hermesConfig.mcpServers['hexo-pro'].env.HEXOPRO_BASE_DIR, hexo.base_dir);
  assert.equal(enabled.data.tokenHash, undefined);
  assert.ok(settings.tokenHash);
  assert.notEqual(settings.tokenHash, enabled.data.token);
});
