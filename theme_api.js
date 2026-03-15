const path = require('path');
const fs = require('hexo-fs');
const fse = require('fs-extra');
const { exec } = require('child_process');
const yaml = require('js-yaml');

/**
 * 清理 public 目录，确保静态文件重新生成
 * @param {string} publicDir - public 目录路径
 */
async function cleanPublicDir(publicDir) {
  try {
    if (fs.existsSync(publicDir)) {
      await fse.emptyDir(publicDir);
    }
  } catch (err) {
    console.error('[Hexo Pro] 清理 public 目录失败:', err.message);
  }
}
const {
  segmentConfig,
  generateSchemaForSegment,
  mergeSegmentResults,
  countSchemaFields,
  calculateHash,
} = require('./schema_generator')

function getSchemaFilePath(baseDir, themeId) {
  return path.join(baseDir, `_config.${themeId}.schema.json`)
}

/**
 * 从 schema 文件中提取纯 schema（去掉 _meta）
 */
function extractSchemaFromFileContent(fullObj) {
  if (!fullObj || typeof fullObj !== 'object') return null
  const { _meta, ...schema } = fullObj
  return Object.keys(schema).length > 0 ? schema : null
}

/**
 * 读取 schema 文件，若 _meta.configHash 匹配则返回 schema
 */
function readSchemaFileWithMeta(baseDir, themeId) {
  const schemaPath = getSchemaFilePath(baseDir, themeId)
  if (!fs.existsSync(schemaPath)) return null
  try {
    const content = fse.readFileSync(schemaPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * 写入 schema 文件（含 _meta）
 */
function writeSchemaFileWithMeta(baseDir, themeId, schema, configHash, language) {
  const schemaPath = getSchemaFilePath(baseDir, themeId)
  const fullObj = {
    _meta: { configHash, language, generatedAt: new Date().toISOString() },
    ...schema,
  }
  fse.writeFileSync(schemaPath, JSON.stringify(fullObj, null, 2), 'utf-8')
}

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
  {
    id: 'butterfly',
    name: 'Butterfly',
    description: '一款美观且功能强大的 Hexo 主题，支持丰富的文章样式与多种扩展功能',
    author: 'jerryc127',
    repo: 'https://github.com/jerryc127/hexo-theme-butterfly.git',
    branch: 'master',
    installType: 'git',
    dependencies: ['hexo-renderer-pug', 'hexo-renderer-stylus'],
    configFile: '_config.butterfly.yml',
    themeDir: 'butterfly',
  },
  {
    id: 'next',
    name: 'NexT',
    description: '经典老牌主题，极简优雅，性能极佳；支持多种布局（Muse/Mist/Pisces/Gemini），集成 MathJax、Disqus，配置高度灵活；适合喜欢稳定、轻量、SEO 友好的用户，文档与社区支持极强。',
    author: 'theme-next',
    repo: 'https://github.com/theme-next/hexo-theme-next.git',
    branch: 'master',
    installType: 'git',
    dependencies: [],
    configFile: '_config.next.yml',
    themeDir: 'next',
  },
  {
    id: 'fluid',
    name: 'Fluid',
    description: 'Material Design 风格，界面清爽有层次；响应式完美，内置 LaTeX 与 Mermaid 图表支持，自定义项丰富；适合学术 / 技术写作，默认样式已足够美观，无需过多魔改。',
    author: 'fluid-dev',
    repo: 'https://github.com/fluid-dev/hexo-theme-fluid.git',
    branch: 'master',
    installType: 'git',
    dependencies: [],
    configFile: '_config.fluid.yml',
    themeDir: 'fluid',
  },
  {
    id: 'stellar',
    name: 'Stellar',
    description: '综合型主题（博客 + 知识库 + 专栏 + 笔记），组件化设计，内置海量标签 / 数据组件；适合搭建个人知识体系、多内容形态的站点，更新活跃，中文生态好。',
    author: 'xaoxuu',
    repo: 'https://github.com/xaoxuu/hexo-theme-stellar.git',
    branch: 'main',
    installType: 'git',
    dependencies: [],
    configFile: '_config.stellar.yml',
    themeDir: 'stellar',
  },
  {
    id: 'volantis',
    name: 'Volantis',
    description: '模块化、高自由度，卡片式布局 + 丰富的 shortcode；适合喜欢折腾、追求个性化展示的博主，支持多种插件与评论系统，文档详细。',
    author: 'volantis-x',
    repo: 'https://github.com/volantis-x/hexo-theme-volantis.git',
    branch: '7.x',
    installType: 'git',
    dependencies: [],
    configFile: '_config.volantis.yml',
    themeDir: 'volantis',
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

const SNAPSHOT_STORE_DIR = '.hexo-pro/theme-config-snapshots'
const MAX_THEME_CONFIG_SNAPSHOTS = 30

function getThemeSnapshotDir(baseDir) {
  return path.join(baseDir, SNAPSHOT_STORE_DIR)
}

function getThemeSnapshotFilePath(baseDir, themeId) {
  return path.join(getThemeSnapshotDir(baseDir), `${themeId}.json`)
}

function toSnapshotMeta(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const { content, ...meta } = snapshot
  return meta
}

function readThemeConfigSnapshots(baseDir, themeId) {
  const snapshotPath = getThemeSnapshotFilePath(baseDir, themeId)
  if (!fs.existsSync(snapshotPath)) return []
  try {
    const parsed = JSON.parse(fse.readFileSync(snapshotPath, 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.content === 'string')
  } catch {
    return []
  }
}

function writeThemeConfigSnapshots(baseDir, themeId, snapshots) {
  const dir = getThemeSnapshotDir(baseDir)
  fse.ensureDirSync(dir)
  const snapshotPath = getThemeSnapshotFilePath(baseDir, themeId)
  fse.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2), 'utf-8')
}

function createThemeConfigSnapshot(baseDir, themeId, content, options = {}) {
  if (typeof content !== 'string') return null
  const { source = 'manual', note = '' } = options
  const snapshots = readThemeConfigSnapshots(baseDir, themeId)
  const hash = calculateHash(content)

  if (snapshots[0] && snapshots[0].hash === hash) {
    return null
  }

  const createdAt = new Date().toISOString()
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    themeId,
    createdAt,
    source,
    note: String(note).slice(0, 120),
    hash,
    size: Buffer.byteLength(content, 'utf-8'),
    content,
  }

  const next = [snapshot, ...snapshots].slice(0, MAX_THEME_CONFIG_SNAPSHOTS)
  writeThemeConfigSnapshots(baseDir, themeId, next)
  return toSnapshotMeta(snapshot)
}

function readThemeConfigContent(baseDir, theme) {
  const configPath = path.join(baseDir, theme.configFile)
  const themeConfigPath = path.join(baseDir, 'themes', theme.themeDir, '_config.yml')

  if (fs.existsSync(configPath)) {
    return fse.readFileSync(configPath, 'utf-8')
  }
  if (fs.existsSync(themeConfigPath)) {
    return fse.readFileSync(themeConfigPath, 'utf-8')
  }
  return null
}

function ensureThemeConfigFile(baseDir, theme) {
  const configPath = path.join(baseDir, theme.configFile)
  if (fs.existsSync(configPath)) return configPath

  const themePath = path.join(baseDir, 'themes', theme.themeDir)
  const themeConfigSrc = path.join(themePath, '_config.yml')
  if (fs.existsSync(themeConfigSrc)) {
    fse.copyFileSync(themeConfigSrc, configPath)
  }
  return configPath
}

function isThemeInstalled(baseDir, theme) {
  const themePath = path.join(baseDir, 'themes', theme.themeDir)
  return fs.existsSync(themePath)
}

function getThemeById(themeId) {
  return BUILTIN_THEMES.find((t) => t.id === themeId)
}

function formatYamlParseError(error) {
  const fallback = 'YAML 语法错误'
  if (!error || typeof error !== 'object') return fallback

  const baseMessage = typeof error.message === 'string' ? error.message : fallback
  const line = typeof error.mark?.line === 'number' ? error.mark.line + 1 : null
  const column = typeof error.mark?.column === 'number' ? error.mark.column + 1 : null

  if (line && column) {
    return `${baseMessage} (line ${line}, column ${column})`
  }
  return baseMessage
}

function validateYamlContent(content) {
  try {
    yaml.load(content)
    return null
  } catch (error) {
    return formatYamlParseError(error)
  }
}

async function applyThemeConfigContent(hexo, baseDir, theme, content) {
  if (!isThemeInstalled(baseDir, theme)) {
    throw new Error('主题未安装')
  }

  const configPath = ensureThemeConfigFile(baseDir, theme)
  fse.writeFileSync(configPath, content, 'utf-8')
  const isCurrentTheme = (hexo.config.theme === theme.themeDir)

  if (!isCurrentTheme) {
    return {
      success: true,
      message: '配置已保存（非当前主题，未热更新）',
      tip: '切换到该主题后配置会生效',
    }
  }

  try {
    const newThemeConfig = yaml.load(content) || {}
    if (newThemeConfig && typeof newThemeConfig === 'object') {
      hexo.config.theme_config = Object.assign({}, hexo.config.theme_config, newThemeConfig)
      if (hexo.theme && hexo.theme.config) {
        hexo.theme.config = Object.assign({}, hexo.theme.config, newThemeConfig)
      }
      hexo.log.info('主题配置已在内存中热更新')
    }
  } catch (err) {
    hexo.log.warn('解析主题配置失败，已保存文件:', err.message)
  }

  if (hexo.locals && hexo.locals.invalidate) {
    hexo.locals.invalidate()
    hexo.log.info('Hexo locals 缓存已清除')
  }

  hexo.emit('generateBefore')

  setImmediate(async () => {
    hexo.log.info('[Hexo Pro] 主题配置已更新，正在重新生成站点...')
    try {
      const publicDir = path.join(hexo.base_dir, 'public')
      await cleanPublicDir(publicDir)
      hexo.log.info('[Hexo Pro] public 目录已清理')

      await hexo._generate({ cache: false })
      hexo.log.info('[Hexo Pro] 站点重新生成成功')
    } catch (err) {
      hexo.log.error('[Hexo Pro] 站点重新生成失败:', err.message)
    }
  })

  return {
    success: true,
    message: '配置已保存，正在重新生成站点...',
    tip: '如果页面未更新，请尝试强制刷新浏览器 (Ctrl+F5 或 Cmd+Shift+R)',
  }
}

module.exports = function (app, hexo, use, db) {
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

        // 3. 复制主题配置到根目录作为覆盖配置
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

    const theme = getThemeById(themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    const baseDir = hexo.base_dir;

    try {
      const content = readThemeConfigContent(baseDir, theme);
      if (content === null) {
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

    const theme = getThemeById(themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    const baseDir = hexo.base_dir;
    const previousContent = readThemeConfigContent(baseDir, theme);

    if (!isThemeInstalled(baseDir, theme)) {
      return res.send(404, '主题未安装');
    }

    if (typeof content !== 'string') {
      return res.send(400, {
        code: 400,
        message: '配置内容必须是字符串',
      })
    }

    const parseError = validateYamlContent(content)
    if (parseError) {
      return res.send(400, {
        code: 400,
        message: 'YAML 配置语法错误，保存已取消',
        details: parseError,
      })
    }

    (async () => {
      try {
        let snapshot = null
        if (typeof previousContent === 'string' && previousContent !== content) {
          snapshot = createThemeConfigSnapshot(baseDir, themeId, previousContent, { source: 'auto-save' })
        }

        const result = await applyThemeConfigContent(hexo, baseDir, theme, content)
        res.done(Object.assign({}, result, { snapshot }))
      } catch (error) {
        hexo.log.error('保存主题配置失败:', error);
        res.send(500, '保存主题配置失败');
      }
    })()
  });

  // 获取主题配置快照列表
  use('theme/config/snapshots', function (req, res) {
    const themeId = req.query.themeId || req.body?.themeId;
    if (!themeId) {
      return res.send(400, '缺少主题ID');
    }

    const theme = getThemeById(themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    try {
      const snapshots = readThemeConfigSnapshots(hexo.base_dir, themeId)
        .map((item) => toSnapshotMeta(item))
        .filter(Boolean)
      res.done({ snapshots, total: snapshots.length, max: MAX_THEME_CONFIG_SNAPSHOTS })
    } catch (error) {
      hexo.log.error('读取主题快照失败:', error)
      res.send(500, '读取主题快照失败')
    }
  })

  // 手动创建主题配置快照
  use('theme/config/snapshot/create', function (req, res) {
    if (req.method !== 'POST') return;

    const { themeId, note = '' } = req.body || {}
    if (!themeId) {
      return res.send(400, '缺少主题ID')
    }

    const theme = getThemeById(themeId)
    if (!theme) {
      return res.send(404, '主题不存在')
    }

    try {
      const content = readThemeConfigContent(hexo.base_dir, theme)
      if (typeof content !== 'string') {
        return res.send(404, '主题配置文件不存在')
      }

      const snapshot = createThemeConfigSnapshot(hexo.base_dir, themeId, content, {
        source: 'manual',
        note,
      })
      if (!snapshot) {
        return res.done({
          success: true,
          skipped: true,
          message: '当前配置与最近快照一致，已跳过创建',
        })
      }

      res.done({
        success: true,
        message: '快照已创建',
        snapshot,
      })
    } catch (error) {
      hexo.log.error('创建主题快照失败:', error)
      res.send(500, '创建主题快照失败')
    }
  })

  // 回滚主题配置到指定快照
  use('theme/config/rollback', function (req, res) {
    if (req.method !== 'POST') return;

    const { themeId, snapshotId } = req.body || {}
    if (!themeId || !snapshotId) {
      return res.send(400, '缺少主题ID或快照ID')
    }

    const theme = getThemeById(themeId)
    if (!theme) {
      return res.send(404, '主题不存在')
    }

    const snapshots = readThemeConfigSnapshots(hexo.base_dir, themeId)
    const targetSnapshot = snapshots.find((item) => item.id === snapshotId)
    if (!targetSnapshot) {
      return res.send(404, '快照不存在')
    }

    ; (async () => {
      try {
        const currentContent = readThemeConfigContent(hexo.base_dir, theme)
        let backupSnapshot = null
        if (typeof currentContent === 'string' && currentContent !== targetSnapshot.content) {
          backupSnapshot = createThemeConfigSnapshot(hexo.base_dir, themeId, currentContent, {
            source: 'rollback-backup',
            note: `before rollback to ${snapshotId}`,
          })
        }

        const result = await applyThemeConfigContent(hexo, hexo.base_dir, theme, targetSnapshot.content)
        res.done(Object.assign({}, result, {
          rollbackTo: toSnapshotMeta(targetSnapshot),
          backupSnapshot,
        }))
      } catch (error) {
        hexo.log.error('回滚主题配置失败:', error)
        res.send(500, '回滚主题配置失败')
      }
    })()
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

  // 切换主题
  use('theme/switch', function (req, res) {
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
    const themePath = path.join(baseDir, 'themes', theme.themeDir);

    // 检查主题是否已安装
    if (!fs.existsSync(themePath)) {
      return res.send(400, '主题未安装，请先安装主题');
    }

    try {
      // 更新 _config.yml 的 theme 字段
      const configPath = path.join(baseDir, '_config.yml');
      let configContent = fse.readFileSync(configPath, 'utf-8');
      let config;
      try {
        config = yaml.load(configContent);
      } catch (e) {
        hexo.log.error('解析 _config.yml 失败:', e);
        return res.send(500, '解析站点配置失败');
      }

      // 检查是否已经是当前主题
      if (config.theme === theme.themeDir) {
        // _config.yml 已经是目标主题，但当前运行中的 hexo.config 可能尚未同步（常见于安装后未重启）
        const needRestart = hexo.config.theme !== theme.themeDir;
        if (needRestart) {
          hexo.config.theme = theme.themeDir;
        }

        return res.done({
          success: true,
          message: needRestart ? '主题已切换，重启后生效' : '已经是当前主题',
          themeDir: theme.themeDir,
          needRestart,
        });
      }

      config.theme = theme.themeDir;
      fse.writeFileSync(configPath, yaml.dump(config), 'utf-8');
      hexo.log.info(`[Theme] 已切换主题为 ${theme.themeDir}`);

      // 更新内存中的配置，确保后续查询能获取正确的当前主题
      hexo.config.theme = theme.themeDir;

      // 复制主题配置到根目录作为覆盖配置（如果不存在）
      const themeConfigSrc = path.join(themePath, '_config.yml');
      const themeConfigDest = path.join(baseDir, theme.configFile);
      let configCopied = false;
      if (fs.existsSync(themeConfigSrc) && !fs.existsSync(themeConfigDest)) {
        fse.copyFileSync(themeConfigSrc, themeConfigDest);
        hexo.log.info(`[Theme] 已创建覆盖配置文件 ${theme.configFile}`);
        configCopied = true;
      }

      res.done({
        success: true,
        message: '主题切换成功',
        themeDir: theme.themeDir,
        configCopied,
        needRestart: true, // 标记需要重启才能生效
      });
    } catch (error) {
      hexo.log.error('[Theme] 切换失败:', error.message);
      res.send(500, error.message || '主题切换失败');
    }
  });

  // 获取主题 Schema（从独立 JSON 文件）
  use('theme/schema', function (req, res) {
    const themeId = req.query.themeId || req.body?.themeId
    if (!themeId) {
      return res.send(400, '缺少主题ID')
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId)
    if (!theme) {
      return res.send(404, '主题不存在')
    }

    const baseDir = hexo.base_dir
    const schemaPath = getSchemaFilePath(baseDir, themeId)

    try {
      const fullObj = readSchemaFileWithMeta(baseDir, themeId)
      if (!fullObj) {
        return res.done({ schema: null, hasSchema: false })
      }
      const schema = extractSchemaFromFileContent(fullObj)
      res.done({ schema: schema || null, hasSchema: !!schema })
    } catch (error) {
      hexo.log.error('读取 Schema 失败:', error)
      res.done({ schema: null, hasSchema: false })
    }
  })

  // 保存主题 Schema 到独立 JSON 文件（含 _meta 用于缓存校验）
  use('theme/schema/save', function (req, res) {
    if (req.method !== 'POST') return

    const { themeId, schema, language = 'zh' } = req.body || {}
    if (!themeId || schema === undefined) {
      return res.send(400, '缺少主题ID或 Schema')
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId)
    if (!theme) {
      return res.send(404, '主题不存在')
    }

    const baseDir = hexo.base_dir
    const configPath = path.join(baseDir, theme.configFile)

    try {
      const schemaObj = typeof schema === 'string' ? JSON.parse(schema) : schema
      let configHash = ''
      if (fs.existsSync(configPath)) {
        const configContent = fse.readFileSync(configPath, 'utf-8')
        configHash = calculateHash(configContent)
      }
      writeSchemaFileWithMeta(baseDir, themeId, schemaObj, configHash, language)
      res.done({ success: true, message: 'Schema 已保存' })
    } catch (error) {
      hexo.log.error('保存 Schema 失败:', error)
      res.send(500, '保存 Schema 失败')
    }
  })

  // 生成主题配置 Schema（输出独立 JSON，不修改 YAML）
  use('theme/schema/generate', function (req, res) {
    if (req.method !== 'POST') return;

    const { themeId, language = 'zh', forceRegenerate = false } = req.body || {};

    if (!themeId) {
      return res.send(400, '缺少主题ID');
    }

    const theme = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (!theme) {
      return res.send(404, '主题不存在');
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    (async () => {
      try {
        const baseDir = hexo.base_dir
        const configPath = path.join(baseDir, theme.configFile)

        // 检查配置文件是否存在
        if (!fs.existsSync(configPath)) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: '主题配置文件不存在' })}\n\n`);
          return res.end();
        }

        const configContent = fse.readFileSync(configPath, 'utf-8');
        const configHash = calculateHash(configContent);

        // 尝试从 schema 文件读取缓存（强制重新生成时跳过）
        if (!forceRegenerate) {
          const fileCache = readSchemaFileWithMeta(baseDir, themeId);
          if (fileCache && fileCache._meta && fileCache._meta.configHash === configHash && fileCache._meta.language === language) {
            const schemaFromFile = extractSchemaFromFileContent(fileCache);
            if (schemaFromFile && Object.keys(schemaFromFile).length > 0) {
              res.write(
                `data: ${JSON.stringify({
                  type: 'start',
                  totalChunks: 1,
                  configSize: configContent.length,
                  cached: true,
                })}\n\n`
              );
              const fieldCount = countSchemaFields(schemaFromFile);
              res.write(
                `data: ${JSON.stringify({
                  type: 'complete',
                  fullResult: configContent,
                  schema: schemaFromFile,
                  summary: `已为 ${fieldCount} 个字段生成 schema (从缓存)`,
                })}\n\n`
              );
              return res.end();
            }
          }
        }

        // 发送初始化消息
        const segments = segmentConfig(configContent, 5000);
        res.write(
          `data: ${JSON.stringify({
            type: 'start',
            totalChunks: segments.length,
            configSize: configContent.length,
          })}\n\n`
        );

        // 获取 AI 配置（从数据库读取）
        let aiSettings = null;
        if (db && db.settingsDb) {
          aiSettings = await new Promise((resolve, reject) => {
            db.settingsDb.findOne({ type: 'ai' }, (err, doc) => {
              if (err) resolve(null);
              else resolve(doc);
            });
          });
        }

        if (!aiSettings || !aiSettings.url || !aiSettings.apiKey) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI 配置不完整' })}\n\n`);
          return res.end();
        }

        const results = [];

        // 处理每个段
        for (let i = 0; i < segments.length; i++) {
          try {
            res.write(
              `data: ${JSON.stringify({
                type: 'chunk_processing',
                current: i + 1,
                total: segments.length,
                status: `正在分析第 ${i + 1}/${segments.length} 段...`,
              })}\n\n`
            );

            const segmentResult = await generateSchemaForSegment(
              segments[i],
              aiSettings,
              language,
              i + 1,
              segments.length
            );

            results.push(segmentResult);

            res.write(
              `data: ${JSON.stringify({
                type: 'chunk_result',
                chunk: i + 1,
                result: segmentResult.substring(0, 100) + '...',
              })}\n\n`
            );
          } catch (segmentError) {
            hexo.log.error(`[Schema] 第 ${i + 1} 段处理失败:`, segmentError.message);
            res.write(
              `data: ${JSON.stringify({
                type: 'error',
                message: `第 ${i + 1} 段处理失败: ${segmentError.message}`,
              })}\n\n`
            );
            return res.end();
          }
        }

        // 合并结果
        const schemaObj = mergeSegmentResults(results);
        if (typeof schemaObj !== 'object' || Object.keys(schemaObj).length === 0) {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              message: 'AI 未返回有效的 schema',
            })}\n\n`
          );
          return res.end();
        }
        const fieldCount = countSchemaFields(schemaObj);

        // 保存到 schema 文件（含 _meta 用于下次缓存校验）
        writeSchemaFileWithMeta(baseDir, themeId, schemaObj, configHash, language);

        // fullResult 为原始 YAML（不修改），schema 为独立 JSON
        res.write(
          `data: ${JSON.stringify({
            type: 'complete',
            fullResult: configContent,
            schema: schemaObj,
            summary: `已为 ${fieldCount} 个字段生成 schema`,
          })}\n\n`
        );

        res.end();
      } catch (error) {
        hexo.log.error('[Schema Generator] 错误:', error);
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: error.message || '生成 Schema 失败',
          })}\n\n`
        );
        res.end();
      }
    })();
  });
};
