const login_api = require('./login_api');
const post_api = require('./post_api')
const page_api = require('./page_api')
const image_api = require('./image_api') // 添加图片API
const yaml_api = require('./yaml_api');
const dashboard_api = require('./dashboard_api'); // 添加仪表盘API
const deploy_api = require('./deploy_api'); // 添加部署API
const settings_api = require('./settings_api'); // 添加设置API
const auth_api = require('./auth_api'); // 添加认证API
const recycle_api = require('./recycle_api'); // 回收站API
const CircularJSON = require('circular-json');
const crypto = require('crypto');
const { expressjwt: jwt } = require('express-jwt'); // 确保引入 express-jwt
const bodyParser = require('body-parser');
const databaseManager = require('./database-manager'); // 导入数据库管理器

// Helper function to promisify NeDB methods
function promisifyNeDB(db, method, ...args) {
    return new Promise((resolve, reject) => {
        db[method](...args, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

module.exports = async function (app, hexo) { // 将导出函数改为 async

    app.use('/hexopro/api', bodyParser.json({ limit: '50mb' }));
    app.use('/hexopro/api', bodyParser.urlencoded({ extended: true }));

    var use = function (path, fn) {
        // 检查路径中是否包含参数（如 :id）
        if (path.includes(':')) {
            // 将 :param 转换为正则表达式 ([^/]+)
            const paramNames = [];
            const regexPath = path.replace(/:([^/]+)/g, (match, paramName) => {
                paramNames.push(paramName);
                return '([^/]+)';
            });

            // 创建正则表达式对象
            const rootPrefix = hexo.config.root || '/'; // 处理 root 可能为空或 / 的情况
            const apiBasePath = `${rootPrefix}hexopro/api/`.replace('//', '/'); // 确保只有一个斜杠
            const pathRegex = new RegExp('^' + apiBasePath + regexPath + '$');

            app.use(function (req, res, next) {
                // 检查请求路径是否匹配正则表达式
                const match = req.url.split('?')[0].match(pathRegex);
                if (match) {
                    // 如果匹配，提取参数值并添加到 req.params
                    req.params = req.params || {};
                    for (let i = 0; i < paramNames.length; i++) {
                        req.params[paramNames[i]] = match[i + 1];
                    }

                    // 设置 done 和 send 方法
                    var done = function (val) {
                        if (!val) {
                            res.statusCode = 204
                            return res.end('');
                        }
                        res.setHeader('Content-type', 'application/json; charset=utf-8')
                        res.end(CircularJSON.stringify(val))
                    }
                    res.done = done
                    res.send = function (num, data) {
                        res.statusCode = num
                        if (data === undefined || data === null) {
                            res.setHeader('Content-type', 'application/json; charset=utf-8')
                            return res.end(JSON.stringify({ code: num }))
                        }
                        if (typeof data === 'string') {
                            res.setHeader('Content-type', 'application/json; charset=utf-8')
                            return res.end(JSON.stringify({ code: num, msg: data }))
                        }
                        if (Buffer.isBuffer(data)) {
                            res.setHeader('Content-type', 'application/octet-stream')
                            return res.end(data)
                        }
                        // object or other types -> JSON
                        res.setHeader('Content-type', 'application/json; charset=utf-8')
                        return res.end(CircularJSON.stringify(data))
                    }

                    // 调用处理函数
                    fn(req, res, next);
                } else {
                    // 如果不匹配，继续下一个中间件
                    next();
                }
            });
        } else {
            // 对于没有参数的路径，修改为精确匹配
            const rootPrefix = hexo.config.root || '/'; // 处理 root 可能为空或 / 的情况
            const apiBasePath = `${rootPrefix}hexopro/api/`.replace('//', '/'); // 确保只有一个斜杠
            const exactPath = apiBasePath + path;

            app.use(exactPath, function (req, res, next) {
                // 确保路径完全匹配，避免子路径被拦截
                // 修改这里的逻辑以正确处理根路径和查询参数
                const requestPath = req.originalUrl.split('?')[0];
                if (requestPath !== exactPath) {
                    return next();
                }

                var done = function (val) {
                    if (!val) {
                        res.statusCode = 204
                        return res.end('');
                    }
                    res.setHeader('Content-type', 'application/json; charset=utf-8')
                    res.end(CircularJSON.stringify(val))
                }
                res.done = done
                res.send = function (num, data) {
                    res.statusCode = num
                    if (data === undefined || data === null) {
                        res.setHeader('Content-type', 'application/json; charset=utf-8')
                        return res.end(JSON.stringify({ code: num }))
                    }
                    if (typeof data === 'string') {
                        res.setHeader('Content-type', 'application/json; charset=utf-8')
                        return res.end(JSON.stringify({ code: num, msg: data }))
                    }
                    if (Buffer.isBuffer(data)) {
                        res.setHeader('Content-type', 'application/octet-stream')
                        return res.end(data)
                    }
                    res.setHeader('Content-type', 'application/json; charset=utf-8')
                    return res.end(CircularJSON.stringify(data))
                }
                fn(req, res, next)
            })
        }
    }

    // 将actualNeedLogin和jwtSecret设为全局变量，以便其他模块可以访问
    global.actualNeedLogin = false;
    global.jwtSecret = null;

    try {
        // --- 使用数据库管理器初始化数据库 ---
        console.log('[Hexo Pro API]: 初始化数据库...');
        const db = await databaseManager.initialize(hexo);
        console.log('[Hexo Pro API]: 数据库初始化完成');

        // --- 检查用户数量并设置认证状态 ---
        const count = await promisifyNeDB(db.userDb, 'count', {});
        console.log('[Hexo Pro API]: 用户数量检查完成, count:', count);

        if (count > 0) {
            global.actualNeedLogin = true;
            console.log('[Hexo Pro API]: 数据库中存在用户，启用登录验证');

            // 获取或生成 JWT secret
            let settings = await promisifyNeDB(db.settingsDb, 'findOne', { type: 'system' });
            console.log('[Hexo Pro API]: 系统设置检查完成');

            if (settings && settings.jwtSecret) {
                global.jwtSecret = settings.jwtSecret;
                console.log('[Hexo Pro API]: 从数据库加载 JWT 密钥');
            } else {
                // 生成新的 JWT secret
                global.jwtSecret = crypto.randomBytes(64).toString('hex');
                console.log('[Hexo Pro API]: 生成新的 JWT 密钥');

                // 保存到数据库
                const systemSettingUpdate = {
                    type: 'system',
                    jwtSecret: global.jwtSecret,
                    updatedAt: new Date()
                };
                if (!settings) {
                    systemSettingUpdate.createdAt = new Date();
                    await promisifyNeDB(db.settingsDb, 'insert', systemSettingUpdate);
                    console.log('[Hexo Pro API]: 新 JWT 密钥已保存到数据库 (insert)');
                } else {
                    await promisifyNeDB(db.settingsDb, 'update', { type: 'system' }, { $set: systemSettingUpdate }, {});
                    console.log('[Hexo Pro API]: 新 JWT 密钥已保存到数据库 (update)');
                }
            }
        } else {
            console.log('[Hexo Pro API]: 数据库中没有用户，无需登录验证');
        }

        // --- 在数据库检查完成后配置 JWT 中间件和路由 ---
        const rootPrefix = hexo.config.root || '/'; // 处理 root 可能为空或 / 的情况
        const apiBasePath = `${rootPrefix}hexopro/api`.replace('//', '/'); // API基础路径
        const unlessPaths = [
            `${apiBasePath}/login`,
            `${apiBasePath}/settings/check-first-use`,
            `${apiBasePath}/settings/register`,
            `${apiBasePath}/settings/skip-setup`, // 添加跳过设置API到排除列表
            `${apiBasePath}/auth/status`, // 添加认证状态检查路径到排除列表
            `${apiBasePath}/desktop/status`, // 添加桌面端状态API到排除列表
            `${apiBasePath}/desktop/auth-check`, // 添加桌面端认证检查API到排除列表  
            `${apiBasePath}/desktop/save-token` // 添加桌面端保存token API到排除列表
        ];


        if (global.actualNeedLogin) {
            console.log('启用JWT验证，secret:', global.jwtSecret ? '已设置' : '未设置');
            console.log('排除的路径:', unlessPaths);

            if (!global.jwtSecret) {
                // 理论上不应该发生，因为上面已经处理了生成逻辑
                console.error('[Hexo Pro API]: 严重错误 - JWT Secret 未能生成或加载!');
                global.jwtSecret = crypto.randomBytes(64).toString('hex'); // 再次尝试生成以防万一
            }

            // 使用更简单的路径匹配方式
            app.use(apiBasePath, jwt({ // 应用于 /hexopro/api 基础路径
                secret: global.jwtSecret,
                algorithms: ["HS256"],
                requestProperty: 'auth' // 确保将解码后的token信息存储在req.auth中
            }).unless({ path: unlessPaths })); // 排除特定路径
        } else {
            console.log('[Hexo Pro API]: 未启用JWT验证');
        }

        // 注册所有 API 路由
        login_api(app, hexo, use, db); // 移除不再需要的参数
        post_api(app, hexo, use);
        page_api(app, hexo, use);
        image_api(app, hexo, use, db); // 注册图片API并传入数据库实例以持久化图床配置
        yaml_api(app, hexo, use);
        dashboard_api(app, hexo, use); // 注册仪表盘API
        deploy_api(app, hexo, use, db); // 传递数据库实例到部署API
        settings_api(app, hexo, use, db); // 注册设置API
        recycle_api(app, hexo, use, db); // 注册回收站API
        auth_api(app, hexo, use); // 注册认证API


        app.use((err, req, res, next) => {
            if (err.name === 'UnauthorizedError') {
                console.error('[Hexo Pro API]: token 验证失败:', err.message); // 添加日志记录
                res.setHeader('Content-type', 'application/json')
                res.statusCode = 200 // 或者 401
                res.end(JSON.stringify({ code: 401, msg: 'token unauthorized' })) // 修正拼写
            } else {
                console.error('[Hexo Pro API]: 未知错误:', err.message); // 添加日志记录
                res.setHeader('Content-type', 'application/json')
                res.statusCode = 500
                res.end(JSON.stringify({ code: 500, msg: 'unknown err:' + err.message })) // 返回错误消息
            }
        })

    } catch (err) {
        console.error('[Hexo Pro API]: API 初始化失败:', err);
        // 可以在这里添加错误处理逻辑，例如阻止服务器启动或返回错误状态
    }

    // 返回实际的 needLogin 状态和 JWT secret (虽然现在是全局的，但保持返回可能对某些调用有用)
    return {
        needLogin: global.actualNeedLogin,
        jwtSecret: global.jwtSecret
    };
};