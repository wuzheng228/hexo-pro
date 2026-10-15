'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createHermesConfig({ baseDir, token, packageDir = __dirname, version = require('./package.json').version }) {
  const script = [
    path.join(packageDir, 'bin', 'hexo-pro-mcp.mjs'),
    path.resolve(packageDir, '..', 'bin', 'hexo-pro-mcp.mjs')
  ].find(file => fs.existsSync(file));

  // Desktop builds can ship the backend without the standalone CLI.
  const launch = script
    ? { command: 'node', args: [script] }
    : { command: 'npx', args: ['--yes', '--package', `hexo-pro@${version}`, 'hexo-pro-mcp'] };

  return {
    mcpServers: {
      'hexo-pro': {
        ...launch,
        env: {
          HEXOPRO_BASE_DIR: baseDir,
          HEXO_PRO_MCP_TOKEN: token || '<paste-token-here>'
        }
      }
    }
  };
}

module.exports = { createHermesConfig };
