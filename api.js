
var post_api = require('./post_api')
const CircularJSON = require('circular-json');
module.exports = function (app, hexo) {
    var use = function (path, fn) {
        app.use(hexo.config.root + 'hexopro/api/' + path, function (req, res) {
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
            fn(req, res)
        })
    }
    console.log(hexo)
    post_api(app, hexo, use)
}