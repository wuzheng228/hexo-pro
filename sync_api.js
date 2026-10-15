const fs = require('fs');
const path = require('path');
const { createSyncService, maskSyncConfig } = require('./sync_service');
const { createCloudSync } = require('./cloud_sync');
const { prepareDocumentIds } = require('./document_identity');

module.exports = function (app, hexo, use) {
  const service = createSyncService(hexo.base_dir);
  const cloud = createCloudSync(hexo.base_dir, { publicDir: path.resolve(hexo.base_dir, hexo.config.public_dir || 'public'), sourceDir: hexo.config.source_dir || 'source' });
  let status = { isSyncing: false, stage: 'idle', logs: [], error: null, lastSyncTime: '' };

  function deployConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(hexo.base_dir, 'deploy_config.json'), 'utf8')); }
    catch { return {}; }
  }
  function publicConfig() {
    const config = service.readConfig(), deploy = deployConfig();
    return { ...maskSyncConfig(config), projectPath: hexo.base_dir,
      suggestedRepository: deploy.repository || '', suggestedBranch: deploy.branch || 'main', hasDeployCredential: Boolean(deploy.token) };
  }
  function sendError(res, error) {
    status = { ...status, isSyncing: false, stage: 'failed', error: error.message };
    res.send(error.statusCode || 500, error.message || '云同步失败');
  }
  function post(name, handler) {
    use(name, async (req, res, next) => {
      if (req.method !== 'POST') return next();
      if (status.isSyncing) return res.send(409, '云同步正在进行，请稍后再试');
      try { await handler(req, res); } catch (error) { sendError(res, error); }
    });
  }
  async function run(res, stage, callback) {
    status = { ...status, isSyncing: true, stage, error: null, logs: [] };
    const result = await callback();
    status = { ...status, isSyncing: false, stage: stage === 'syncing' ? 'completed' : 'ready', error: null };
    if (result.lastSyncTime) {
      service.saveConfig({ lastSyncTime: result.lastSyncTime });
      status.lastSyncTime = result.lastSyncTime;
    }
    res.done(result);
  }

  use('sync/config', (req, res) => res.done(publicConfig()));
  use('sync/status', (req, res) => {
    const config = service.readConfig();
    res.done({ ...status, hasRepository: Boolean(config.repository), hasGithubToken: Boolean(config.githubToken),
      lastSyncTime: config.lastSyncTime, projectPath: hexo.base_dir });
  });
  post('sync/save-config', async (req, res) => { service.saveConfig(req.body || {}); res.done(publicConfig()); });
  post('sync/token/clear', async (req, res) => { service.saveConfig({ githubToken: '' }); res.done(publicConfig()); });
  post('sync/import-deploy', async (req, res) => {
    const deploy = deployConfig();
    if (!deploy.repository) throw new Error('尚未配置 GitHub 部署仓库');
    service.saveConfig({ repository: deploy.repository, branch: deploy.branch || 'main', githubToken: deploy.token || '' });
    res.done(publicConfig());
  });
  post('sync/check', (req, res) => run(res, 'checking', () => cloud.check(service.readConfig())));
  post('sync/preview', (req, res) => run(res, 'checking', () => {
    if (req.body?.mode !== 'restore' && typeof hexo.model === 'function') prepareDocumentIds(hexo);
    return cloud.preview(service.readConfig(), req.body?.mode);
  }));
  post('sync/diff', async (req, res) => res.done(cloud.diff(req.body?.id, req.body?.path)));
  post('sync/apply', (req, res) => run(res, 'syncing', async () => {
    const result = await cloud.apply(service.readConfig(), req.body?.id, req.body?.resolutions);
    if (result.mode === 'restore') {
      result.refreshWarning = '请重新打开博客，使恢复的配置、主题和依赖生效。';
    } else if (result.downloaded && typeof hexo.source?.process === 'function') {
      try { await hexo.source.process(); }
      catch { result.refreshWarning = '文件已同步，文章列表刷新失败，请重新打开博客'; }
    }
    return result;
  }));
  // Older callers must review changes instead of silently rewriting the project's Git checkout.
  for (const action of ['push', 'pull', 'run']) post(`sync/${action}`, async (req, res) => res.send(409, '请前往云同步页面，检查变更后再同步'));
};
