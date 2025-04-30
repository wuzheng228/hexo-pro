
const login_api = require('./login_api');
const post_api = require('./post_api')
const page_api = require('./page_api')
const image_api = require('./image_api') // 添加图片API
const yaml_api = require('./yaml_api');
const dashboard_api = require('./dashboard_api'); // 添加仪表盘API
const deploy_api = require('./deploy_api'); // 添加部署API
const CircularJSON = require('circular-json');
module.exports = function (app, hexo, needLogin) {
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
            // 对于没有参数的路径，保持原来的处理方式
            app.use(hexo.config.root + 'hexopro/api/' + path, function (req, res, next) {
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
    login_api(app, hexo, use, needLogin)
    post_api(app, hexo, use)
    page_api(app, hexo, use)
    image_api(app, hexo, use) // 注册图片API
    yaml_api(app, hexo, use)
    dashboard_api(app, hexo, use) // 注册仪表盘API
    deploy_api(app, hexo, use) // 注册部署API
}