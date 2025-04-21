
const login_api = require('./login_api');
const post_api = require('./post_api')
const page_api = require('./page_api')
const image_api = require('./image_api') // 添加图片API
const CircularJSON = require('circular-json');
module.exports = function (app, hexo, needLogin) {
    var use = function (path, fn) {
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
    login_api(app, hexo, use, needLogin)
    post_api(app, hexo, use)
    page_api(app, hexo, use)
    image_api(app, hexo, use) // 注册图片API
}