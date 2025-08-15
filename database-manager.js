const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DatabaseManager {
  constructor() {
    this.isInitialized = false;
    this.initPromise = null;
    this.databases = {
      userDb: null,
      settingsDb: null,
      deployStatusDb: null,
      recycleDb: null
    };
    this.hexoInstance = null;
  }

  async initialize(hexo) {
    // 如果已经初始化，直接返回数据库实例
    if (this.isInitialized) {
      console.log('[Database Manager]: 数据库已初始化，返回现有实例');
      return this.databases;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initPromise) {
      console.log('[Database Manager]: 数据库正在初始化，等待完成...');
      return await this.initPromise;
    }

    // 开始初始化
    console.log('[Database Manager]: 开始初始化数据库...');
    this.hexoInstance = hexo;
    this.initPromise = this._performInitialization();

    try {
      const result = await this.initPromise;
      this.isInitialized = true;
      console.log('[Database Manager]: 数据库初始化完成');
      return result;
    } catch (error) {
      // 初始化失败，重置状态
      this.initPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    const hexo = this.hexoInstance;

    // 确保 data 目录存在
    const dataDir = path.join(hexo.base_dir, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 清理损坏的数据库文件
    this._cleanupCorruptedDbFiles(dataDir);

    // 并行创建所有数据库
    console.log('[Database Manager]: 创建数据库实例...');

    const [userDb, settingsDb, deployStatusDb, recycleDb] = await Promise.all([
      this._createDatabase(dataDir, 'users.db'),
      this._createDatabase(dataDir, 'settings.db'),
      this._createDatabase(dataDir, 'deploy_status.db'),
      this._createDatabase(dataDir, 'recycle.db')
    ]);

    // 保存数据库实例
    this.databases.userDb = userDb;
    this.databases.settingsDb = settingsDb;
    this.databases.deployStatusDb = deployStatusDb;
    this.databases.recycleDb = recycleDb;

    console.log('[Database Manager]: 所有数据库实例创建完成');

    // 初始化数据库内容
    await this._initializeDeployStatus(deployStatusDb);
    await this._initializeUserAndSettings(userDb, settingsDb, hexo);

    return this.databases;
  }

  _cleanupCorruptedDbFiles(dataDir) {
    const dbFiles = ['users.db', 'settings.db', 'deploy_status.db', 'recycle.db'];

    dbFiles.forEach(dbFile => {
      const filePath = path.join(dataDir, dbFile);

      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          // 如果文件大小为0字节，则删除它
          if (stats.size === 0) {
            console.log(`[Database Manager]: 删除损坏的数据库文件 ${dbFile}`);
            fs.unlinkSync(filePath);
          }
        }

        // 清理临时文件（以 ~ 结尾）
        const tempFilePath = filePath + '~';
        if (fs.existsSync(tempFilePath)) {
          console.log(`[Database Manager]: 清理临时文件 ${dbFile}~`);
          fs.unlinkSync(tempFilePath);
        }
      } catch (error) {
        console.warn(`[Database Manager]: 清理文件 ${dbFile} 时出错:`, error.message);
      }
    });
  }

  _createDatabase(dataDir, filename, retryCount = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const attemptLoad = () => {
        attempts++;
        console.log(`[Database Manager]: 创建数据库 ${filename} (尝试 ${attempts}/${retryCount})`);

        const db = new Datastore({
          filename: path.join(dataDir, filename),
          autoload: true,
          onload: function (error) {
            if (error) {
              console.error(`[Database Manager]: 数据库 ${filename} 创建失败 (尝试 ${attempts}):`, error.message);

              if (attempts < retryCount) {
                console.log(`[Database Manager]: ${delay}ms 后重试创建数据库 ${filename}...`);
                setTimeout(attemptLoad, delay);
              } else {
                console.error(`[Database Manager]: 数据库 ${filename} 创建失败，达到最大重试次数`);
                reject(new Error(`数据库 ${filename} 创建失败: ${error.message}`));
              }
            } else {
              console.log(`[Database Manager]: 数据库 ${filename} 创建成功`);
              resolve(db);
            }
          }
        });
      };

      attemptLoad();
    });
  }

  async _initializeDeployStatus(deployStatusDb) {
    return new Promise((resolve, reject) => {
      deployStatusDb.findOne({ type: 'status' }, (err, doc) => {
        if (err) {
          reject(err);
          return;
        }

        if (!doc) {
          deployStatusDb.insert({
            type: 'status',
            isDeploying: false,
            progress: 0,
            stage: 'idle',
            lastDeployTime: '',
            logs: [],
            error: null
          }, (insertErr) => {
            if (insertErr) {
              reject(insertErr);
            } else {
              console.log('[Database Manager]: 部署状态数据库初始化完成');
              resolve();
            }
          });
        } else if (doc.isDeploying) {
          // 如果服务重启时发现有未完成的部署，自动重置状态
          deployStatusDb.update(
            { type: 'status' },
            {
              $set: {
                isDeploying: false,
                stage: 'failed',
                error: 'deploy.interruption.cause.by.service.restart',
                logs: [...(doc.logs || []), 'deploy.interruption.cause.by.service.restart.status.reset']
              }
            },
            {},
            (updateErr) => {
              if (updateErr) {
                reject(updateErr);
              } else {
                console.log('[Database Manager]: 重置未完成的部署状态');
                resolve();
              }
            }
          );
        } else {
          console.log('[Database Manager]: 部署状态数据库已存在');
          resolve();
        }
      });
    });
  }

  async _initializeUserAndSettings(userDb, settingsDb, hexo) {
    try {
      // 检查用户数据库是否为空
      const userCount = await new Promise((resolve, reject) => {
        userDb.count({}, (err, count) => {
          if (err) reject(err);
          else resolve(count);
        });
      });

      // 如果数据库为空且配置中有用户名和密码，则导入
      if (userCount === 0 && hexo.config.hexo_pro && hexo.config.hexo_pro.username && hexo.config.hexo_pro.password) {
        const defaultUser = {
          username: hexo.config.hexo_pro.username,
          password: hexo.config.hexo_pro.password,
          avatar: hexo.config.avatar ? hexo.config.avatar : '',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await new Promise((resolve, reject) => {
          userDb.insert(defaultUser, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
          });
        });

        console.log('[Database Manager]: 从配置文件导入初始用户');

        // 检查系统设置数据库是否为空
        const settingsCount = await new Promise((resolve, reject) => {
          settingsDb.count({ type: 'system' }, (err, count) => {
            if (err) reject(err);
            else resolve(count);
          });
        });

        // 如果设置为空，则导入或生成 JWT secret
        if (settingsCount === 0) {
          const jwtSecret = hexo.config.hexo_pro && hexo.config.hexo_pro.secret
            ? hexo.config.hexo_pro.secret
            : crypto.randomBytes(32).toString('hex');

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
            console.log('[Database Manager]: 从配置文件导入 JWT 密钥');
          } else {
            console.log('[Database Manager]: 自动生成 JWT 密钥');
          }
        }

        global.actualNeedLogin = true;
      }
    } catch (error) {
      console.error('[Database Manager]: 初始化用户和设置失败', error);
      throw error;
    }
  }

  // 获取数据库实例（确保已初始化）
  getDatabases() {
    if (!this.isInitialized) {
      throw new Error('数据库尚未初始化，请先调用 initialize()');
    }
    return this.databases;
  }

  // 检查是否已初始化
  isReady() {
    return this.isInitialized;
  }

  // 重置状态（用于测试或重新初始化）
  reset() {
    console.log('[Database Manager]: 重置数据库管理器状态');
    this.isInitialized = false;
    this.initPromise = null;
    this.databases = {
      userDb: null,
      settingsDb: null,
      deployStatusDb: null,
      recycleDb: null
    };
    this.hexoInstance = null;
  }
}

// 创建全局单例实例
const databaseManager = new DatabaseManager();

module.exports = databaseManager; 