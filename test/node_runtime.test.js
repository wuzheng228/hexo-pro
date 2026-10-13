'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire, isBuiltin } = require('node:module');
const test = require('node:test');
const { MIN_NODE_VERSION, assertSupportedNode } = require('../node-runtime');

const unsupportedVersions = ['16.20.2', '18.18.2', '20.18.9'];
const supportedVersions = ['20.19.0', '20.19.1', '20.20.0', '22.12.0', '24.21.0'];

function isVersionError(error, actualVersion) {
  assert.equal(error.code, 'ERR_HEXOPRO_UNSUPPORTED_NODE');
  assert.ok(error.message.includes(`Node.js ${MIN_NODE_VERSION}`));
  assert.ok(error.message.includes(`current version: ${actualVersion}`));
  assert.match(error.message, /Update Node\.js/);
  assert.match(error.message, /desktop client.*update the app/);
  return true;
}

test('rejects Node 16, Node 18, and Node 20 below the required minor version', () => {
  for (const version of unsupportedVersions) {
    assert.throws(() => assertSupportedNode(version), error => isVersionError(error, version));
  }
});

test('accepts Node 20.19 and newer Node 20, 22, and 24 releases', () => {
  for (const version of supportedVersions) {
    assert.doesNotThrow(() => assertSupportedNode(version));
  }
});

test('package metadata and startup checks declare the same minimum Node version', () => {
  assert.equal(require('../package.json').engines.node, `>=${MIN_NODE_VERSION}`);
});

const runtimePath = path.resolve(__dirname, '../node-runtime.js');

function loadRuntime(version) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), {
    module,
    process: { versions: { node: version } }
  }, { filename: runtimePath });
  return module.exports;
}

for (const entry of ['index.js', 'headless_server.js']) {
  test(`${entry} rejects an unsupported runtime before loading business dependencies`, () => {
    const entryPath = path.resolve(__dirname, '..', entry);
    const requireFromEntry = createRequire(entryPath);
    for (const version of unsupportedVersions) {
      const runtime = loadRuntime(version);
      const businessDependencies = [];
      const module = { exports: {} };
      const requireForEntry = request => {
        if (requireFromEntry.resolve(request) === runtimePath) return runtime;
        if (isBuiltin(request)) return requireFromEntry(request);
        businessDependencies.push(request);
        throw new Error(`Loaded a business dependency before rejecting Node ${version}: ${request}`);
      };
      assert.throws(() => vm.runInNewContext(fs.readFileSync(entryPath, 'utf8'), {
        require: requireForEntry,
        module,
        exports: module.exports,
        __filename: entryPath,
        __dirname: path.dirname(entryPath),
        process: { versions: { node: version } }
      }, { filename: entryPath }), error => isVersionError(error, version));
      assert.deepEqual(businessDependencies, []);
    }
  });
}
