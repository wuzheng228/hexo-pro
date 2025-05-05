const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');

module.exports = function(hexo) {
  // 确保 data 目录存在
  const dataDir = path.join(hexo.base_dir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 创建用户数据库
  const userDb = new Datastore({
    filename: path.join(dataDir, 'users.db'),
    autoload: true
  });

  // 创建设置数据库
  const settingsDb = new Datastore({
    filename: path.join(dataDir, 'settings.db'),
    autoload: true
  });

  // 初始化数据库，从 _config.yml 导入初始用户（仅在数据库为空时）
  const initDb = async () => {
    try {
      // 检查用户数据库是否为空
      const userCount = await new Promise((resolve, reject) => {
        userDb.count({}, (err, count) => {
          if (err) reject(err);
          else resolve(count);
        });
      });

      // 如果数据库为空且配置中有用户名和密码，则导入
      // 这是为了向后兼容，仅在首次运行时从配置导入用户
      if (userCount === 0 && hexo.config.hexo_pro && hexo.config.hexo_pro.username) {
        const defaultUser = {
          username: hexo.config.hexo_pro.username,
          password: hexo.config.hexo_pro.password,
          avatar:   hexo.config.avatar ? hexo.config.avatar :  '',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await new Promise((resolve, reject) => {
          userDb.insert(defaultUser, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
          });
        });

        console.log('[Hexo Pro]: 已从配置文件导入初始用户（仅首次运行）');
        
        // 如果有 JWT secret，也导入到设置数据库
        if (hexo.config.hexo_pro.secret) {
          await new Promise((resolve, reject) => {
            settingsDb.insert({
              type: 'system',
              jwtSecret: hexo.config.hexo_pro.secret,
              createdAt: new Date()
            }, (err, doc) => {
              if (err) reject(err);
              else resolve(doc);
            });
          });
          console.log('[Hexo Pro]: 已从配置文件导入 JWT 密钥');
        }

        global.actualNeedLogin = true;
      }
    } catch (error) {
      console.error('[Hexo Pro]: 初始化数据库失败', error);
    }
  };

  // 执行初始化
  initDb();

  return {
    userDb,
    settingsDb
  };
};