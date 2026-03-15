const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const browserSync = require('browser-sync').create();
const { createRequire } = require('module');

const blogPath = path.resolve(
  process.env.HEXO_BLOG_PATH || '/Users/warms/Workspace/code/node_project/blog'
);

function ensureDebugRuntime(baseDir) {
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Blog path does not exist: ${baseDir}`);
  }

  process.chdir(baseDir);

  // Make "hexo" command in child_process (e.g. Volantis env check) resolve project-local CLI.
  const localBin = path.join(baseDir, 'node_modules', '.bin');
  process.env.PATH = process.env.PATH
    ? `${localBin}${path.delimiter}${process.env.PATH}`
    : localBin;
}

function getProjectHexo(baseDir) {
  const requireFromProject = createRequire(path.join(baseDir, 'package.json'));
  return requireFromProject('hexo');
}

async function startHexoServer() {
  ensureDebugRuntime(blogPath);
  const Hexo = getProjectHexo(blogPath);
  const hexo = new Hexo(blogPath, { cache: false });

  await hexo
    .init()
    .then(function () {
      return hexo.load();
    })
    .then(function () {
      console.log('Hexo 初始化完成，开始调试');
      console.log('Hexo 版本:', hexo.version);
      console.log('当前工作目录:', process.cwd());
    })
    .catch(function (err) {
      console.error('Hexo 初始化失败:', err);
      throw err;
    });

  await hexo.call('server', {
    port: 8001,
    ip: '127.0.0.1',
  });

  console.log('Hexo server is running at http://127.0.0.1:8001');

  const currentTheme = hexo.config.theme || 'landscape';
  browserSync.init({
    proxy: 'http://127.0.0.1:8001',
    files: ['public/**/*', `themes/${currentTheme}/**/*`],
    notify: false,
    open: 'external',
    ui: false,
    port: 8081,
  });

  const themePath = path.join(hexo.base_dir, 'themes', currentTheme);
  const watcher = chokidar.watch(themePath, {
    ignored: /^\./,
    persistent: true,
  });

  watcher.on('change', async (filePath) => {
    console.log(`文件变动: ${filePath}`);
    await hexo.call('generate', {});
    console.log('Hexo 页面已重新生成');
    browserSync.reload();
  });

  watcher.on('error', (error) => console.error('监听错误:', error));
}

startHexoServer().catch((err) => {
  console.error(err);
});
