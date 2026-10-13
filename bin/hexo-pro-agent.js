#!/usr/bin/env node
'use strict';

const { HexoProAgentClient } = require('../agent/client');

function parseJson(value, label) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function hasFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function print(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function usage() {
  process.stdout.write(`Hexo Pro Agent CLI

Usage:
  hexo-pro-agent search <query>
  hexo-pro-agent list [--drafts] [--page 1] [--page-size 12]
  hexo-pro-agent get <permalink>
  hexo-pro-agent draft --title <title> [--content <markdown>] [--tags '["a"]'] [--categories '["notes"]']
  hexo-pro-agent update <permalink> [--title <title>] [--content <markdown>] [--tags '["a"]'] [--categories '["notes"]'] [--front-matter '{"cover":"/x.png"}']
  hexo-pro-agent publish <permalink>
  hexo-pro-agent unpublish <permalink>
  hexo-pro-agent deploy [--targets '["github"]'] [--skip-generate]
  hexo-pro-agent deploy-status
  hexo-pro-agent mcp

Environment:
  HEXO_PRO_BASE_URL    Optional explicit Hexo Pro server URL
  HEXOPRO_BASE_DIR     Blog directory used to read .hexo-pro/runtime.json
  HEXO_PRO_RUNTIME_FILE Optional explicit runtime.json path
  HEXOPRO_AGENT_PORT   Optional port shortcut when probing should be skipped
  HEXO_PRO_AUTO_START  Start a headless Hexo Pro server from MCP when needed
  HEXO_PRO_HEADLESS_PORT Headless server port, default 8787
  HEXO_PRO_TOKEN       Optional JWT token when Hexo Pro auth is enabled
  HEXO_PRO_MCP_TOKEN   Optional MCP Agent token for JWT-free agent endpoints
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const client = new HexoProAgentClient();

  if (!command || command === '-h' || command === '--help') {
    usage();
    return;
  }

  if (command === 'mcp') {
    await import('./hexo-pro-mcp.mjs');
    return;
  }

  if (command === 'search') {
    print(await client.searchPosts({ query: args.join(' ') }));
    return;
  }

  if (command === 'list') {
    print(await client.listPosts({
      published: !hasFlag(args, '--drafts'),
      page: Number(takeOption(args, '--page') || 1),
      pageSize: Number(takeOption(args, '--page-size') || 12)
    }));
    return;
  }

  if (command === 'get') {
    print(await client.getPost({ permalink: args[0] }));
    return;
  }

  if (command === 'draft') {
    print(await client.createDraft({
      title: takeOption(args, '--title'),
      content: takeOption(args, '--content'),
      tags: parseJson(takeOption(args, '--tags'), '--tags'),
      categories: parseJson(takeOption(args, '--categories'), '--categories')
    }));
    return;
  }

  if (command === 'update') {
    print(await client.updatePost({
      permalink: args[0],
      title: takeOption(args, '--title'),
      content: takeOption(args, '--content'),
      tags: parseJson(takeOption(args, '--tags'), '--tags'),
      categories: parseJson(takeOption(args, '--categories'), '--categories'),
      frontMatter: parseJson(takeOption(args, '--front-matter'), '--front-matter')
    }));
    return;
  }

  if (command === 'publish') {
    print(await client.publishPost({ permalink: args[0] }));
    return;
  }

  if (command === 'unpublish') {
    print(await client.unpublishPost({ permalink: args[0] }));
    return;
  }

  if (command === 'deploy') {
    print(await client.deploy({
      deployTargets: parseJson(takeOption(args, '--targets'), '--targets'),
      skipGenerate: hasFlag(args, '--skip-generate')
    }));
    return;
  }

  if (command === 'deploy-status') {
    print(await client.getDeployStatus());
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
