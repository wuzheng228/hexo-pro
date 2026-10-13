'use strict';

const { getActiveHexo } = require('./theme_runtime');
const { findDocument } = require('./document_identity');

function previewError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function renderPreview(hexo, kind, id, { content, title }) {
  if (!['post', 'page'].includes(kind)) throw previewError('不支持的文章类型', 400);
  if (typeof content !== 'string' || (title !== undefined && typeof title !== 'string')) {
    throw previewError('预览内容或标题格式不正确', 400);
  }
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw previewError('预览内容不能超过 2 MB', 413);
  }

  const active = getActiveHexo(hexo);
  const document = findDocument(active, kind === 'post' ? 'Post' : 'Page', id);
  if (!document) throw previewError('文章不存在，请重新打开编辑器', 404);

  // Match Hexo's generator locals while keeping the saved model untouched.
  const data = { ...document, _content: content, content };
  if (title !== undefined) data.title = title;
  data[kind === 'post' ? '__post' : '__page'] = true;
  const rendered = await active.post.render(document.full_source, data);
  const routePath = active.route.format(document.path || 'index.html');
  const Locals = active._generateLocals();
  const locals = await active.execFilter('template_locals', new Locals(routePath, rendered), { context: active });
  // Disable fragment caches: a preview must reflect the unsaved content.
  locals.cache = false;

  const layouts = kind === 'post' ? ['post', 'page', 'index'] : ['page', 'post', 'index'];
  if (typeof rendered.layout === 'string') layouts.unshift(rendered.layout);
  const view = layouts.map(layout => active.theme.getView(layout)).find(Boolean);
  if (!view) throw previewError('当前主题没有可用的文章模板', 422);

  let html = await view.render(locals);
  html = active.extend.injector.exec(html, locals);
  html = await active.execFilter('_after_html_render', html, { context: active, args: [locals] });
  return { html, theme: active.config.theme, path: routePath };
}

function previewBaseURL(req, hexo, routePath) {
  const protocol = req.protocol || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const origin = `${protocol}://${req.headers.host}`;
  const root = hexo.config.root || '/';
  return new URL(root.replace(/\/?$/, '/') + routePath, origin).href;
}

module.exports = function registerPreviewApi(app, hexo, use) {
  use('preview/:kind/:id', async (req, res) => {
    if (req.method !== 'POST') return res.send(405, { message: '请使用 POST 请求预览' });
    try {
      const result = await renderPreview(hexo, req.params.kind, req.params.id, req.body || {});
      res.done({ ...result, baseURL: previewBaseURL(req, hexo, result.path) });
    } catch (error) {
      res.send(error.statusCode || 500, { message: error.message || '主题预览失败' });
    }
  });
};

module.exports.renderPreview = renderPreview;
