'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

// The plugin also runs under ordinary Hexo. Only desktop workers set these
// paths; those workers must never fall back to tools found on the host PATH.
function resolveTool(command, args = [], env = process.env) {
  const managed = env.HEXOPRO_MANAGED_RUNTIME === '1';
  const required = name => {
    const value = env[name];
    if (managed && (!value || !path.isAbsolute(value))) throw new Error('应用内置组件不可用，请重新安装 Hexo Pro Desktop。');
    return value;
  };
  if (!managed) return { command, args };
  if (command === 'git') return { command: required('HEXOPRO_GIT_PATH'), args };
  if (command === 'node') return { command: required('HEXOPRO_NODE_PATH'), args };
  if (command === 'npm' || command === 'npx') {
    const cli = required('HEXOPRO_NPM_CLI');
    return { command: required('HEXOPRO_NODE_PATH'), args: [command === 'npm' ? cli : path.join(path.dirname(cli), 'npx-cli.js'), ...args] };
  }
  return { command, args };
}

function runTool(command, args, { timeout = 600000, ...options } = {}) {
  const resolved = resolveTool(command, args, options.env || process.env);
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, { ...options, shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('操作超时，请检查网络后重试')); }, timeout);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `操作失败 (${code})`));
    });
  });
}

module.exports = { resolveTool, runTool };
