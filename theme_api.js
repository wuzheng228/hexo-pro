const path = require('path');
const fs = require('hexo-fs');
const fse = require('fs-extra');
const { exec } = require('child_process');
const yaml = require('js-yaml');

// 内置主题列表
const BUILTIN_THEMES = [
  {
    id: 'anzhiyu',
    name: '安知鱼',
    description: '简洁美丽的 Hexo 主题，功能丰富，支持多种评论系统、音乐、相册等',
    author: 'anzhiyu-c',
    repo: 'https://github.com/anzhiyu-c/hexo-theme-anzhiyu.git',
    branch: 'main',
    installType: 'git',
    dependencies: ['hexo-renderer-pug', 'hexo-renderer-stylus'],
    configFile: '_config.anzhiyu.yml',
    themeDir: 'anzhiyu',
  },
];

function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: options.cwd || process.cwd(), timeout: 120000, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = function (app, hexo, use) {
  // 获取内置主题列表
  use('theme/list', function (req, res) {
    try {
      res.done(BUILTIN_THEMES);
    } catch (error) {
      hexo.log.error('获取主题列表失败:', error);
      res.send(500, '获取主题列表失败');
    }
  });

  // 获取当前主题信息
  use('theme/current', function (req, res) {
    try {
      const themeName = hexo.config.theme || 'landscape';
      const themesDir = path.join(hexo.base_dir, 'themes');
      const themePath = path.join(themesDir, themeName);
      const installed = fs.existsSync(themePath);

      const builtin = BUILTIN_THEMES.find((t) => t.themeDir === themeName || t.id === themeName);

      res.done({
        name: themeName,
        installed,
        builtin: !!builtin,
        themeInfo: builtin || null,
      });
    } catch (error) {
      hexo.log.error('获取当前主题失败:', error);
      res.send(500, '获取当前主题失败');
    }
  });

  // 一键安装主题
  use('theme/install', function (req, res) {
    if (req.method !== 'POST') return;

    const { themeId } = req.body || {};
    if (!themeId) {
      return res.send(400, '缺少主题ID');
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    const baseDir = hexo.base_dir;
    const themesDir = path.join(baseDir, 'themes');
    const themePath = path.join(themesDir, theme.themeDir);

    if (fs.existsSync(themePath)) {
      return res.done({
        success: true,
        message: '主题已安装',
        themeDir: theme.themeDir,
      });
    }

    (async () => {
      try {
        fse.ensureDirSync(themesDir);

        // 1. git clone
        hexo.log.info(`[Theme] 正在克隆主题 ${theme.name}...`);
        await execPromise(`git clone -b ${theme.branch} ${theme.repo} "${themePath}"`, { cwd: baseDir });

        // 2. 安装依赖
        if (theme.dependencies && theme.dependencies.length > 0) {
          hexo.log.info(`[Theme] 正在安装主题依赖...`);
          await execPromise(`npm install ${theme.dependencies.join(' ')} --save`, { cwd: baseDir });
        }

        // 3. 更新 _config.yml 的 theme 字段
        const configPath = path.join(baseDir, '_config.yml');
        let configContent = fse.readFileSync(configPath, 'utf-8');
        let config;
        try {
          config = yaml.load(configContent);
        } catch (e) {
          hexo.log.error('解析 _config.yml 失败:', e);
          return res.send(500, '解析站点配置失败');
        }
        config.theme = theme.themeDir;
        fse.writeFileSync(configPath, yaml.dump(config), 'utf-8');
        hexo.log.info(`[Theme] 已设置主题为 ${theme.themeDir}`);

        // 4. 复制主题配置到根目录作为覆盖配置
        const themeConfigSrc = path.join(themePath, '_config.yml');
        const themeConfigDest = path.join(baseDir, theme.configFile);
        if (fs.existsSync(themeConfigSrc) && !fs.existsSync(themeConfigDest)) {
          fse.copyFileSync(themeConfigSrc, themeConfigDest);
          hexo.log.info(`[Theme] 已创建覆盖配置文件 ${theme.configFile}`);
        }

        hexo.log.info(`[Theme] 主题 ${theme.name} 安装完成`);
        res.done({
          success: true,
          message: '主题安装完成',
          themeDir: theme.themeDir,
        });
      } catch (error) {
        hexo.log.error('[Theme] 安装失败:', error.message);
        res.send(500, error.message || '主题安装失败');
      }
    })();
  });

  // 获取主题配置内容
  use('theme/config', function (req, res) {
    const themeId = req.query.themeId || req.body?.themeId;
    if (!themeId) {
      return res.send(400, '缺少主题ID');
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    const baseDir = hexo.base_dir;
    const configPath = path.join(baseDir, theme.configFile);
    const themeConfigPath = path.join(baseDir, 'themes', theme.themeDir, '_config.yml');

    try {
      let content = '';
      if (fs.existsSync(configPath)) {
        content = fse.readFileSync(configPath, 'utf-8');
      } else if (fs.existsSync(themeConfigPath)) {
        content = fse.readFileSync(themeConfigPath, 'utf-8');
      } else {
        return res.send(404, '主题配置文件不存在');
      }
      res.done({ content, configPath: theme.configFile });
    } catch (error) {
      hexo.log.error('读取主题配置失败:', error);
      res.send(500, '读取主题配置失败');
    }
  });

  // 保存主题配置
  use('theme/config/save', function (req, res) {
    if (req.method !== 'POST') return;

    const { themeId, content } = req.body || {};
    if (!themeId || content === undefined) {
      return res.send(400, '缺少主题ID或配置内容');
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    const baseDir = hexo.base_dir;
    const configPath = path.join(baseDir, theme.configFile);
    const themePath = path.join(baseDir, 'themes', theme.themeDir);

    if (!fs.existsSync(themePath)) {
      return res.send(404, '主题未安装');
    }

    try {
      // 确保覆盖配置文件存在
      if (!fs.existsSync(configPath)) {
        const themeConfigSrc = path.join(themePath, '_config.yml');
        if (fs.existsSync(themeConfigSrc)) {
          fse.copyFileSync(themeConfigSrc, configPath);
        }
      }

      fse.writeFileSync(configPath, content, 'utf-8');

      // 重新加载主题配置到内存
      try {
        const newThemeConfig = yaml.load(content);
        hexo.theme.config = Object.assign({}, hexo.theme.config, newThemeConfig);
      } catch (err) {
        hexo.log.warn('解析主题配置失败，已保存文件:', err.message);
      }

      res.done({
        success: true,
        message: '配置已保存，正在后台重新生成站点...',
      });

      // 后台执行 hexo clean && hexo g
      exec('hexo clean && hexo g', { cwd: baseDir }, (error, stdout, stderr) => {
        if (error) {
          hexo.log.error('重新生成站点失败:', error.message);
        } else {
          hexo.log.info('主题配置更新后，站点重新生成成功');
        }
      });
    } catch (error) {
      hexo.log.error('保存主题配置失败:', error);
      res.send(500, '保存主题配置失败');
    }
  });

  // 检查主题是否已安装
  use('theme/installed', function (req, res) {
    const themeId = req.query.themeId;
    if (!themeId) {
      return res.send(400, '缺少主题ID');
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.done({ installed: false });
    }

    const themePath = path.join(hexo.base_dir, 'themes', theme.themeDir);
    const currentTheme = hexo.config.theme;
    const isCurrent = currentTheme === theme.themeDir;

    res.done({
      installed: fs.existsSync(themePath),
      isCurrent,
    });
  });
};
