'use strict';

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

// Keep one handle for APIs even when a new Hexo instance owns the theme.
const RUNTIME = Symbol.for('hexo-pro.theme-runtime');

function getRuntime(hexo) {
  if (hexo[RUNTIME]) return hexo[RUNTIME];

  const runtime = { current: hexo, switching: false };
  const serverRoute = hexo.route;
  if (serverRoute) {
    // hexo-server captures this router when it installs its middleware.
    for (const name of ['get', 'list', 'format', 'isModified']) {
      const original = serverRoute[name].bind(serverRoute);
      serverRoute[name] = (...args) => {
        const route = runtime.current.route;
        return route === serverRoute ? original(...args) : route[name](...args);
      };
    }
  }

  // The CLI and desktop shutdown paths may still hold the original instance.
  for (const name of ['call', 'load', 'watch', 'unwatch', 'exit']) {
    const original = hexo[name].bind(hexo);
    hexo[name] = (...args) => runtime.current === hexo
      ? original(...args)
      : runtime.current[name](...args);
  }

  runtime.hexo = new Proxy(hexo, {
    get(target, key) {
      if (key === RUNTIME) return runtime;
      const current = runtime.current;
      const value = Reflect.get(current, key);
      return typeof value === 'function' && key !== 'constructor'
        ? value.bind(current)
        : value;
    },
    set(target, key, value) {
      return Reflect.set(runtime.current, key, value);
    },
  });
  Object.defineProperty(hexo, RUNTIME, { value: runtime });
  return runtime;
}

function getLiveHexo(hexo) {
  return getRuntime(hexo).hexo;
}

// A render must finish with the same theme even if a switch happens meanwhile.
function getActiveHexo(hexo) {
  return getRuntime(hexo).current;
}

function clearThemeModules(themeDir) {
  const prefixes = [path.resolve(themeDir) + path.sep];
  if (fs.existsSync(themeDir)) prefixes.push(fs.realpathSync(themeDir) + path.sep);
  for (const file of Object.keys(require.cache)) {
    if (prefixes.some(prefix => file.startsWith(prefix))) delete require.cache[file];
  }
}

async function stopWatching(hexo) {
  const watchers = [hexo.source, hexo.theme].map(box => box && box.watcher).filter(Boolean);
  hexo.unwatch();
  await Promise.all(watchers.map(watcher => watcher.close()));
}

async function waitForGeneration(hexo) {
  const deadline = Date.now() + 30000;
  while (hexo._isGenerating) {
    if (Date.now() > deadline) throw new Error('站点正在生成，请稍后再切换主题');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function restoreFile(file, written, original) {
  if (written === undefined) return;
  const current = await fs.readFile(file, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (current !== written) return;
  if (original === undefined) await fs.remove(file);
  else await fs.writeFile(file, original, 'utf8');
}

async function switchTheme(hexo, theme) {
  const runtime = getRuntime(hexo);
  if (runtime.switching) {
    const error = new Error('主题正在切换，请稍候');
    error.statusCode = 409;
    throw error;
  }
  runtime.switching = true;

  const previous = runtime.current;
  const themeDir = path.join(previous.base_dir, 'themes', theme.themeDir);
  const configPath = previous.config_path || path.join(previous.base_dir, '_config.yml');
  const overridePath = path.join(previous.base_dir, theme.configFile);
  let originalConfig;
  let updatedConfig;
  let copiedConfig;
  let next;
  let stagingDir;
  let previousStopped = false;
  const wasWatching = [previous.source, previous.theme].some(box => box && box.isWatching());

  try {
    originalConfig = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(originalConfig);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('站点配置必须是 YAML 对象');
    }

    // The old switch API sometimes updated config.theme without changing theme_dir.
    if (config.theme === theme.themeDir && previous.config.theme === theme.themeDir &&
        path.resolve(previous.theme_dir) === path.resolve(themeDir)) {
      return { success: true, message: '已经是当前主题', themeDir: theme.themeDir, needRestart: false };
    }

    config.theme = theme.themeDir;
    updatedConfig = yaml.dump(config);
    await fs.writeFile(configPath, updatedConfig, 'utf8');

    const themeConfigPath = path.join(themeDir, '_config.yml');
    if (!await fs.pathExists(overridePath) && await fs.pathExists(themeConfigPath)) {
      copiedConfig = await fs.readFile(themeConfigPath, 'utf8');
      await fs.writeFile(overridePath, copiedConfig, 'utf8');
    }

    clearThemeModules(previous.theme_dir);
    clearThemeModules(themeDir);
    next = new previous.constructor(previous.base_dir.replace(/[\\/]$/, ''), {
      ...previous.env.args,
      config: configPath,
    });
    // Reprocess posts with the new theme's filters instead of reusing db.json.
    next._dbLoaded = true;
    const loadErrors = [];
    const originalLogError = next.log.error.bind(next.log);
    next.log.error = (...args) => {
      const detail = args.find(arg => arg && arg.err)?.err || args.find(arg => arg instanceof Error);
      loadErrors.push(detail ? detail.message : args.map(String).join(' '));
      originalLogError(...args);
    };

    await next.init();
    if (next.config.theme !== theme.themeDir || path.resolve(next.theme_dir) !== path.resolve(themeDir)) {
      throw new Error('新主题未能加载，请检查站点配置');
    }

    const publicDir = previous.public_dir;
    await fs.ensureDir(path.dirname(path.resolve(publicDir)));
    stagingDir = await fs.mkdtemp(path.join(path.dirname(path.resolve(publicDir)), '.hexo-pro-theme-'));
    next.public_dir = stagingDir + path.sep;
    // Render every route before committing. Hexo normally renders templates lazily.
    // Serial writes ensure a failed render leaves no other writes running during rollback.
    await next.call('generate', { force: true, bail: true, concurrency: 1 });
    if (!Object.keys(next.theme.views).length) {
      throw new Error('新主题没有可用的页面模板，请检查主题是否安装完整');
    }
    next.public_dir = publicDir;
    if (wasWatching) await next.watch();
    if (loadErrors.length) throw new Error(`新主题生成失败：${loadErrors[0]}`);
    next.log.error = originalLogError;

    await stopWatching(previous);
    previousStopped = true;
    await waitForGeneration(previous);
    await waitForGeneration(next);

    // Both directories are on the same filesystem. Keep the old output for rollback.
    const backupDir = stagingDir + '-previous';
    const hadPublic = fs.existsSync(publicDir);
    if (hadPublic) fs.renameSync(publicDir, backupDir);
    try {
      fs.renameSync(stagingDir, publicDir);
    } catch (error) {
      if (hadPublic) fs.renameSync(backupDir, publicDir);
      throw error;
    }
    stagingDir = null;

    // Prevent a debounced callback from the retired watcher from generating again.
    previous._generate = () => Promise.resolve();
    Object.defineProperty(next, RUNTIME, { value: runtime });
    runtime.current = next;
    if (hadPublic) {
      await fs.remove(backupDir).catch(error => next.log.warn('旧主题输出清理失败:', error.message));
    }
    next.log.info(`[Theme] 已动态切换为 ${theme.themeDir}`);
    return {
      success: true,
      message: '主题已切换并生效',
      themeDir: theme.themeDir,
      configCopied: copiedConfig !== undefined,
      needRestart: false,
    };
  } catch (error) {
    if (next) await stopWatching(next).catch(() => {});
    // Do not overwrite an edit made externally while the new theme was loading.
    await restoreFile(configPath, updatedConfig, originalConfig);
    await restoreFile(overridePath, copiedConfig);
    if (previousStopped && wasWatching) await previous.watch();
    throw error;
  } finally {
    if (stagingDir) await fs.remove(stagingDir).catch(() => {});
    runtime.switching = false;
  }
}

module.exports = { getLiveHexo, getActiveHexo, switchTheme };
