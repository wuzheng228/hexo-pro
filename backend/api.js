
const login_api = require('hexo-pro/login_api');
const post_api = require('./post_api')
const page_api = require('./page_api')
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
}