'use strict';

const MIN_NODE_VERSION = '20.19.0';

function assertSupportedNode(version = process.versions.node) {
  const parts = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (parts) {
    const major = Number(parts[1]);
    const minor = Number(parts[2]);
    if (major > 20 || (major === 20 && minor >= 19)) return;
  }

  const error = new Error(
    `Hexo Pro requires Node.js ${MIN_NODE_VERSION} or newer for Hexo 8; current version: ${version}. `
    + 'Update Node.js before starting Hexo Pro. For the desktop client, update the app to upgrade its bundled Node.js.'
  );
  error.code = 'ERR_HEXOPRO_UNSUPPORTED_NODE';
  throw error;
}

module.exports = { MIN_NODE_VERSION, assertSupportedNode };
