'use strict';

const {
  DEFAULT_BASE_URL,
  resolveBaseUrl
} = require('./base-url-resolver');

const API_PREFIX = '/hexopro/api';

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function encodePermalink(permalink) {
  return Buffer.from(String(permalink), 'utf8').toString('base64');
}

function encodeDocumentReference(input) {
  return encodeURIComponent(input.documentId || encodePermalink(input.permalink));
}

function getFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  if (globalThis.fetch) return globalThis.fetch.bind(globalThis);
  throw new Error('This command needs Node.js 18+ or a fetch implementation.');
}

class HexoProAgentClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ? String(options.baseUrl).replace(/\/+$/, '') : null;
    this.baseUrlSource = this.baseUrl ? 'options.baseUrl' : null;
    this.env = options.env || process.env;
    this.candidatePorts = options.candidatePorts;
    this.token = options.token || this.env.HEXO_PRO_TOKEN || '';
    this.mcpToken = options.mcpToken || this.env.HEXO_PRO_MCP_TOKEN || this.env.HEXOPRO_MCP_TOKEN || '';
    this.fetchImpl = getFetch(options.fetchImpl);
  }

  async getBaseUrl() {
    if (this.baseUrl) return this.baseUrl;

    const resolved = await resolveBaseUrl({
      env: this.env,
      fetchImpl: this.fetchImpl,
      candidatePorts: this.candidatePorts
    });
    this.baseUrl = resolved.baseUrl;
    this.baseUrlSource = resolved.source;
    return this.baseUrl;
  }

  async buildUrl(apiPath) {
    const baseUrl = await this.getBaseUrl();
    const cleanPath = `/${trimSlashes(apiPath)}`;
    return `${baseUrl}${API_PREFIX}${cleanPath}`;
  }

  async request(method, apiPath, body) {
    const headers = {};
    const options = { method, headers };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(await this.buildUrl(apiPath), options);
    const text = await response.text();
    const contentType = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : '';
    const data = text && contentType && contentType.includes('application/json')
      ? JSON.parse(text)
      : text;

    if (!response.ok) {
      const message = typeof data === 'object' && data && data.msg ? data.msg : text;
      const error = new Error(message || `Hexo Pro API request failed with status ${response.status}`);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data;
  }

  async mcpRequest(apiPath, body) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Hexo-Pro-Mcp-Token': this.mcpToken
    };
    const response = await this.fetchImpl(await this.buildUrl(`/mcp/agent/${trimSlashes(apiPath)}`), {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {})
    });
    const text = await response.text();
    const contentType = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : '';
    const data = text && contentType && contentType.includes('application/json')
      ? JSON.parse(text)
      : text;

    if (!response.ok || (data && typeof data === 'object' && data.code && data.code >= 400)) {
      const message = typeof data === 'object' && data && data.msg ? data.msg : text;
      const error = new Error(message || `Hexo Pro MCP request failed with status ${response.status}`);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'data')
      ? data.data
      : data;
  }

  async searchPosts(input) {
    if (this.mcpToken) return this.mcpRequest('/posts/search', input);
    return this.request('POST', '/blog/search', { searchPattern: input.query });
  }

  async listPosts(input = {}) {
    if (this.mcpToken) return this.mcpRequest('/posts/list', input);
    const page = input.page || 1;
    const pageSize = input.pageSize || 12;
    const published = input.published !== false;
    return this.request('GET', `/posts/list?published=${published}&page=${page}&pageSize=${pageSize}`);
  }

  async getPost(input) {
    if (this.mcpToken) return this.mcpRequest('/posts/get', input);
    return this.request('GET', `/posts/${encodeDocumentReference(input)}`);
  }

  async createDraft(input) {
    if (this.mcpToken) return this.mcpRequest('/posts/create-draft', input);
    const body = {
      title: input.title,
      tags: input.tags,
      categories: input.categories
    };
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);

    const post = await this.request('POST', '/posts/new', body);
    if (input.content) {
      await this.updatePost({ documentId: post.documentId, permalink: post.permalink, content: input.content });
    }
    return post;
  }

  async updatePost(permalinkOrInput, maybeUpdate) {
    const input = typeof permalinkOrInput === 'string'
      ? { permalink: permalinkOrInput, ...maybeUpdate }
      : permalinkOrInput;
    if (this.mcpToken) return this.mcpRequest('/posts/update', input);

    const update = {};

    if (input.title !== undefined) update.title = input.title;
    if (input.content !== undefined) update._content = input.content;
    if (input.tags !== undefined) update.tags = input.tags;
    if (input.categories !== undefined) update.categories = input.categories;
    if (input.frontMatter !== undefined) update.frontMatter = input.frontMatter;
    if (input.rawUpdate && typeof input.rawUpdate === 'object') {
      Object.assign(update, input.rawUpdate);
    }

    return this.request('POST', `/post/update/${encodeDocumentReference(input)}`, update);
  }

  async publishPost(input) {
    if (this.mcpToken) return this.mcpRequest('/posts/publish', input);
    return this.request('POST', `/posts/${encodeDocumentReference(input)}/publish`, {});
  }

  async unpublishPost(input) {
    if (this.mcpToken) return this.mcpRequest('/posts/unpublish', input);
    return this.request('POST', `/posts/${encodeDocumentReference(input)}/unpublish`, {});
  }

  async getDeployStatus() {
    if (this.mcpToken) return this.mcpRequest('/deploy/status');
    return this.request('GET', '/deploy/status');
  }

  async deploy(input = {}) {
    if (this.mcpToken) return this.mcpRequest('/deploy/execute', input);
    const body = {};
    if (input.deployTargets) body.deployTargets = input.deployTargets;
    if (input.deployType) body.deployType = input.deployType;
    if (input.skipGenerate !== undefined) body.skipGenerate = input.skipGenerate;
    if (input.config) body.config = input.config;
    return this.request('POST', '/deploy/execute', body);
  }
}

module.exports = {
  API_PREFIX,
  DEFAULT_BASE_URL,
  HexoProAgentClient,
  encodePermalink,
  resolveBaseUrl
};
