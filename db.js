const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');
// 添加 crypto 模块用于生成随机密钥
const crypto = require('crypto');

module.exports = function(hexo) {
  // 确保 data 目录存在
  const dataDir = path.join(hexo.base_dir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 检查并清理损坏的数据库文件
  const cleanupCorruptedDbFiles = () => {
    const dbFiles = ['users.db', 'settings.db'];
    
    dbFiles.forEach(dbFile => {
      const filePath = path.join(dataDir, dbFile);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        // 如果文件大小为0字节，则删除它
        if (stats.size === 0) {
          console.log(`[Hexo Pro]: 检测到损坏的数据库文件 ${dbFile}，正在删除...`);
          fs.unlinkSync(filePath);
        }
      }
      
      // 同时检查临时文件（以 ~ 结尾）
      const tempFilePath = filePath + '~';
      if (fs.existsSync(tempFilePath)) {
        console.log(`[Hexo Pro]: 清理临时数据库文件 ${dbFile}~`);
        fs.unlinkSync(tempFilePath);
      }
    });
  };

  // 执行清理
  cleanupCorruptedDbFiles();

  // 创建用户数据库
  const userDb = new Datastore({
    filename: path.join(dataDir, 'users.db'),
    autoload: true,
    onload: function (error) {
      if (error) {
        console.error('[Hexo Pro]: 用户数据库加载失败:', error);
      }
    }
  });

  // 创建设置数据库
  const settingsDb = new Datastore({
    filename: path.join(dataDir, 'settings.db'),
    autoload: true,
    onload: function (error) {
      if (error) {
        console.error('[Hexo Pro]: 设置数据库加载失败:', error);
      }
    }
  });

  // 生成随机 JWT 密钥的函数
  const generateJwtSecret = () => {
    return crypto.randomBytes(32).toString('hex');
  };

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
      if (userCount === 0 && hexo.config.hexo_pro && hexo.config.hexo_pro.username && hexo.config.hexo_pro.password) {
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
        
        // 检查系统设置数据库是否为空
        const settingsCount = await new Promise((resolve, reject) => {
          settingsDb.count({ type: 'system' }, (err, count) => {
            if (err) reject(err);
            else resolve(count);
          });
        });
        
        // 如果设置为空，则导入或生成 JWT secret
        if (settingsCount === 0) {
          // 如果配置中有 JWT secret 则使用，否则生成一个新的
          const jwtSecret = hexo.config.hexo_pro && hexo.config.hexo_pro.secret 
            ? hexo.config.hexo_pro.secret 
            : generateJwtSecret();
          
          await new Promise((resolve, reject) => {
            settingsDb.insert({
              type: 'system',
              jwtSecret: jwtSecret,
              createdAt: new Date()
            }, (err, doc) => {
              if (err) reject(err);
              else resolve(doc);
            });
          });
          
          if (hexo.config.hexo_pro && hexo.config.hexo_pro.secret) {
            console.log('[Hexo Pro]: 已从配置文件导入 JWT 密钥');
          } else {
            console.log('[Hexo Pro]: 已自动生成 JWT 密钥');
          }
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