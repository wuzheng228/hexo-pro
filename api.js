
const login_api = require('./login_api');
const post_api = require('./post_api')
const page_api = require('./page_api')
const image_api = require('./image_api') // 添加图片API
const yaml_api = require('./yaml_api');
const dashboard_api = require('./dashboard_api'); // 添加仪表盘API
const deploy_api = require('./deploy_api'); // 添加部署API
const settings_api = require('./settings_api'); // 添加设置API
const CircularJSON = require('circular-json');
const crypto = require('crypto');

module.exports = function (app, hexo, needLogin) {
    // 初始化数据库
    const db = require('./db')(hexo);
    
    // 修改：根据数据库中是否有用户来决定是否需要登录
    // 将actualNeedLogin和jwtSecret设为全局变量，以便其他模块可以访问
    global.actualNeedLogin = false;
    global.jwtSecret = null;
    
    // 同步检查数据库中是否有用户
    db.userDb.count({}, (err, count) => {
        if (!err && count > 0) {
            global.actualNeedLogin = true;
            console.log('[Hexo Pro]: 数据库中存在用户，启用登录验证');
            
            // 获取或生成 JWT secret
            db.settingsDb.findOne({ type: 'system' }, (err, settings) => {
                if (!err && settings && settings.jwtSecret) {
                    global.jwtSecret = settings.jwtSecret;
                } else {
                    // 生成新的 JWT secret
                    global.jwtSecret = crypto.randomBytes(64).toString('hex');
                    
                    // 保存到数据库
                    if (!settings) {
                        db.settingsDb.insert({
                            type: 'system',
                            jwtSecret: global.jwtSecret,
                            createdAt: new Date()
                        });
                    } else {
                        db.settingsDb.update(
                            { type: 'system' },
                            { $set: { jwtSecret: global.jwtSecret, updatedAt: new Date() } }
                        );
                    }
                    console.log('[Hexo Pro]: 已生成新的 JWT 密钥');
                }
            });
        } else {
            console.log('[Hexo Pro]: 数据库中没有用户，无需登录验证');
        }
    });
    
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
            const pathRegex = new RegExp('^' + hexo.config.root + 'hexopro/api/' + regexPath + '$');
            
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
                        res.setHeader('Content-type', 'application/json')
                        res.end(CircularJSON.stringify(val))
                    }
                    res.done = done
                    res.send = function (num, data) {
                        res.statusCode = num
                        res.end(data)
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
            const exactPath = hexo.config.root + 'hexopro/api/' + path;
            
            app.use(exactPath, function (req, res, next) {
                // 确保路径完全匹配，避免子路径被拦截
                if (req.path !== '/' && req.originalUrl !== exactPath && !req.originalUrl.startsWith(exactPath + '?')) {
                    return next();
                }
                
                var done = function (val) {
                    if (!val) {
                        res.statusCode = 204
                        return res.end('');
                    }
                    res.setHeader('Content-type', 'application/json')
                    res.end(CircularJSON.stringify(val))
                }
                res.done = done
                res.send = function (num, data) {
                    res.statusCode = num
                    res.end(data)
                }
                fn(req, res, next)
            })
        }
    }
    
    login_api(app, hexo, use, global.actualNeedLogin, db, global.jwtSecret)
    post_api(app, hexo, use)
    page_api(app, hexo, use)
    image_api(app, hexo, use) // 注册图片API
    yaml_api(app, hexo, use)
    dashboard_api(app, hexo, use) // 注册仪表盘API
    deploy_api(app, hexo, use) // 注册部署API
    settings_api(app, hexo, use, db) // 注册设置API
    
    // 返回实际的 needLogin 状态和 JWT secret
    return {
        needLogin: global.actualNeedLogin,
        jwtSecret: global.jwtSecret
    };
}