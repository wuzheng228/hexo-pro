var path = require('path');
var fs = require('hexo-fs');
var fse = require('fs-extra');
var yml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');
// 新增：引入 exec 用于执行命令行
const { exec } = require('child_process');

module.exports = function (app, hexo, use) {
  // 获取 YAML 文件列表
  use('yaml/list', function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // 获取所有 YAML 文件
    const yamlFiles = [];
    const rootDir = hexo.base_dir;

    // 递归查找所有 YAML 文件
    function findYamlFiles(dir, relativePath = '') {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const relPath = path.join(relativePath, file).replace(/\\/g, '/');
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          findYamlFiles(filePath, relPath);
        } else if (
          (file.endsWith('.yml') || file.endsWith('.yaml')) &&
          !file.startsWith('.')
        ) {
          const content = fse.readFileSync(filePath, 'utf-8');
          yamlFiles.push({
            name: file,
            path: relPath,
            content: content,
            lastModified: new Date(stat.mtime).toLocaleString()
          });
        }
      }
    }

    findYamlFiles(rootDir);

    // 分页
    const total = yamlFiles.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedFiles = yamlFiles.slice(startIndex, endIndex);

    res.done({
      files: paginatedFiles,
      total: total,
      page: page,
      pageSize: pageSize
    });
  });

  // 创建 YAML 文件
  use('yaml/create', function (req, res) {
    const { name, path: filePath, content } = req.body;

    if (!name) {
      return res.status(400).json({ error: '文件名不能为空' });
    }

    const fullPath = path.join(hexo.base_dir, filePath || '', name);

    // 检查文件是否已存在
    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ error: '文件已存在' });
    }

    // 创建目录（如果不存在）
    if (filePath) {
      const dirPath = path.join(hexo.base_dir, filePath);
      fse.ensureDirSync(dirPath);
    }

    // 写入文件
    fs.writeFileSync(fullPath, content || '');

    res.done({ success: true, path: fullPath });
  });

  // 更新 YAML 文件
  use('yaml/update', function (req, res) {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      // Use res.send for error responses consistent with other parts
      return res.send(400, JSON.stringify({ error: '文件路径不能为空' }));
    }

    const fullPath = path.join(hexo.base_dir, filePath);

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      // Use res.send for error responses
      return res.send(404, JSON.stringify({ error: '文件不存在' }));
    }

    try {
      // 写入文件
      fs.writeFileSync(fullPath, content || '');

      // --- 修改：扩展主题配置文件的判断逻辑 ---
      const themeName = hexo.config.theme; // 获取当前主题名称
      const normalizedFullPath = path.normalize(fullPath);

      // 检查路径1：主题目录内的 _config.yml 或 _config.yaml
      const themeDirConfigYml = path.normalize(path.join(hexo.theme_dir, '_config.yml'));
      const themeDirConfigYaml = path.normalize(path.join(hexo.theme_dir, '_config.yaml'));

      // 检查路径2：站点根目录的 _config.<theme_name>.yml 或 _config.<theme_name>.yaml
      const rootDirConfigYml = path.normalize(path.join(hexo.base_dir, `_config.${themeName}.yml`));
      const rootDirConfigYaml = path.normalize(path.join(hexo.base_dir, `_config.${themeName}.yaml`));

      // --- 新增：检查站点根目录的 _config.yml ---
      const siteConfigYml = path.normalize(path.join(hexo.base_dir, `_config.yml`));

      const isThemeConfigFile = (
        normalizedFullPath === themeDirConfigYml ||
        normalizedFullPath === themeDirConfigYaml ||
        normalizedFullPath === rootDirConfigYml ||
        normalizedFullPath === rootDirConfigYaml
      );

      // --- 新增：判断是否为站点配置文件 ---
      const isSiteConfigFile = normalizedFullPath === siteConfigYml;


      // --- 修改：处理站点或主题配置文件更新 ---
      if (isThemeConfigFile || isSiteConfigFile) {
        const configType = isThemeConfigFile ? '主题' : '站点';
        hexo.log.info(`${configType}配置文件已更新: ${filePath}. 正在重新加载配置并生成...`);

        // 1. 尝试重新加载内存中的配置 (可选，主要依赖 hexo g)
        try {
          // 对于站点配置，需要重新加载 hexo.config
          if (isSiteConfigFile) {
             // 注意：直接修改 hexo.config 可能不完全生效，hexo g 重新加载更可靠
             const newSiteConfigContent = fse.readFileSync(fullPath, 'utf-8');
             const newSiteConfig = yml.load(newSiteConfigContent);
             // 谨慎合并，避免覆盖核心配置
             // hexo.config = Object.assign({}, hexo.config, newSiteConfig);
             hexo.log.info('站点配置已在内存中尝试更新 (效果依赖 hexo g)。');
          }
          // 对于主题配置
          if (isThemeConfigFile) {
            const newThemeConfigContent = fse.readFileSync(fullPath, 'utf-8');
            const newThemeConfig = yml.load(newThemeConfigContent);
            // 只更新主题配置，不重新初始化整个 Hexo
            hexo.theme.config = Object.assign({}, hexo.theme.config, newThemeConfig);
            hexo.log.info('主题配置已在内存中重新加载。');
          }

        } catch (err) {
          hexo.log.error(`无法在内存中重新加载配置文件 ${filePath}:`, err);
          // 即使内存加载失败，也继续尝试 hexo g
        }

        // 2. 使用命令行方式重新生成站点
        exec('hexo clean && hexo g', { cwd: hexo.base_dir }, (error, stdout, stderr) => {
          if (error) {
            hexo.log.error(`重新生成站点失败: ${error.message}`);
            hexo.log.error(stderr);
            // 返回成功保存但生成失败的警告
            return res.done({
              success: true,
              warning: `${configType}配置已更新，但站点重新生成失败，请检查 Hexo 日志并手动运行 'hexo clean && hexo g'。可能需要重启服务才能生效。`
            });
          }

          hexo.log.info(`${configType}配置更新后，站点重新生成成功。`);
          hexo.log.info(stdout);
          // 返回成功信息，并提示重启服务
          return res.done({
            success: true,
            message: `${configType}配置已更新并重新生成站点。请注意：如果正在运行 'hexo server'，您可能需要手动重启服务才能在浏览器中看到更改。`
          });
        });

        // 阻止后续的 res.done({ success: true }); 执行，因为异步 exec 会处理响应
        return;
      }

      // 如果不是主题或站点配置文件，仅返回保存成功
      res.done({ success: true, message: '文件保存成功。' });

    } catch (error) {
      hexo.log.error(`更新 YAML 文件 ${filePath} 时出错:`, error);
      // 使用 res.send 返回错误
      res.send(500, JSON.stringify({ error: '更新文件时出错' }));
    }
  });

  // 删除 YAML 文件
  use('yaml/delete', function (req, res) {
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: '文件路径不能为空' });
    }

    const fullPath = path.join(hexo.base_dir, filePath);

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 删除文件
    fs.unlinkSync(fullPath);

    res.done({ success: true });
  });

  // 获取模板列表
  use('yaml/templates', function (req, res) {
    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');

    // 如果目录不存在，创建它
    if (!fs.existsSync(templatesPath)) {
      fse.ensureDirSync(templatesPath);
      fs.writeFileSync(
        path.join(templatesPath, 'templates.json'),
        JSON.stringify([], null, 2)
      );
      return res.done([]);
    }

    // 读取模板文件
    const templatesFile = path.join(templatesPath, 'templates.json');

    if (!fs.existsSync(templatesFile)) {
      fs.writeFileSync(templatesFile, JSON.stringify([], null, 2));
      return res.done([]);
    }

    const templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));
    res.done(templates);
  });

  // 创建模板
  use('yaml/template/create', function (req, res) {
    const { name, description, structure, variables } = req.body;

    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }

    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');
    fse.ensureDirSync(templatesPath);

    const templatesFile = path.join(templatesPath, 'templates.json');

    let templates = [];
    if (fs.existsSync(templatesFile)) {
      templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));
    }

    // 创建新模板
    const newTemplate = {
      id: uuidv4(),
      name,
      description: description || '',
      structure: structure || '', // 确保structure字段正确保存
      variables: variables || [],
      createdAt: new Date().toISOString()
    };

    templates.push(newTemplate);

    // 保存模板
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));

    res.done(newTemplate);
  });

  // 更新模板
  use('yaml/templates/update', function (req, res) {
    const { id, name, description, structure, variables } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: '模板ID和名称不能为空' });
    }

    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');
    const templatesFile = path.join(templatesPath, 'templates.json');

    if (!fs.existsSync(templatesFile)) {
      return res.status(404).json({ error: '模板文件不存在' });
    }

    let templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));

    // 查找并更新模板
    const templateIndex = templates.findIndex(t => t.id === id);

    if (templateIndex === -1) {
      return res.status(404).json({ error: '模板不存在' });
    }

    templates[templateIndex] = {
      ...templates[templateIndex],
      name,
      description: description || '',
      structure: structure || '',
      variables: variables || [],
      updatedAt: new Date().toISOString()
    };

    // 保存模板
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));

    res.done(templates[templateIndex]);
  });

  // 删除模板
  use('yaml/template/delete', function (req, res) {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: '模板ID不能为空' });
    }

    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');
    const templatesFile = path.join(templatesPath, 'templates.json');

    if (!fs.existsSync(templatesFile)) {
      return res.status(404).json({ error: '模板文件不存在' });
    }

    let templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));

    // 过滤掉要删除的模板
    templates = templates.filter(t => t.id !== id);

    // 保存模板
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));

    res.done({ success: true });
  });

  // 导入模板
  use('yaml/templates/import', function (req, res) {
    const template = req.body;
    
    if (!template || !template.name) {
      return res.status(400).json({ error: '模板数据无效' });
    }
    
    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');
    fse.ensureDirSync(templatesPath);
    
    const templatesFile = path.join(templatesPath, 'templates.json');
    
    let templates = [];
    if (fs.existsSync(templatesFile)) {
      templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));
    }
    
    // 检查是否存在相同ID的模板
    const existingTemplateIndex = templates.findIndex(t => t.id === template.id);
    
    if (existingTemplateIndex !== -1) {
      // 如果存在相同ID的模板，更新它
      templates[existingTemplateIndex] = {
        ...templates[existingTemplateIndex],
        name: template.name,
        description: template.description || '',
        structure: template.structure || '',
        variables: template.variables || [],
        updatedAt: new Date().toISOString()
      };
    } else {
      // 如果不存在相同ID的模板，创建新模板（确保有唯一ID）
      const newTemplate = {
        id: template.id || uuidv4(), // 使用原ID或生成新ID
        name: template.name,
        description: template.description || '',
        structure: template.structure || '',
        variables: template.variables || [],
        createdAt: new Date().toISOString()
      };
      
      templates.push(newTemplate);
    }
    
    // 保存模板
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));
    
    res.done({ success: true });
  });

  // 应用模板
  use('yaml/apply-template', function (req, res) {
    const { templateId, values, targetPath, newFilePath } = req.body;

    if (!templateId || !values) {
      return res.status(400).json({ error: '模板ID和变量值不能为空' });
    }

    // 获取模板
    const templatesPath = path.join(hexo.base_dir, '_yaml_templates');
    const templatesFile = path.join(templatesPath, 'templates.json');

    if (!fs.existsSync(templatesFile)) {
      return res.status(404).json({ error: '模板文件不存在' });
    }

    const templates = JSON.parse(fse.readFileSync(templatesFile, 'utf-8'));
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }

    // 替换变量
    let content = template.structure;

    // 替换所有 ${variable} 格式的变量
    Object.keys(values).forEach(key => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      content = content.replace(regex, values[key]);
    });

    // 确定目标路径
    let finalPath;

    if (targetPath === '__new__' && newFilePath) {
      finalPath = path.join(hexo.base_dir, newFilePath);

      // 确保目录存在
      const dirPath = path.dirname(finalPath);
      fse.ensureDirSync(dirPath);
    } else if (targetPath) {
      finalPath = path.join(hexo.base_dir, targetPath);
    } else {
      return res.status(400).json({ error: '目标路径不能为空' });
    }

    // 写入文件
    fs.writeFileSync(finalPath, content);

    res.done({ success: true, path: finalPath });
  });
};