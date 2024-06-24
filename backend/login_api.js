
const jwt = require('jsonwebtoken')
module.exports = function (app, hexo, use, needLogin) {

    use('login', function (req, res, next) {
        if (!needLogin) return res.done({ code: -2, msg: 'hexo pro login config not set don\'t need login' })
        if (req.method !== 'POST') return next()
        const username = req.body.username
        const password = req.body.password
        if (username != hexo.config.hexo_pro.username) {
            return res.done({ code: -1, msg: 'username or password err' })
        }
        if (password != hexo.config.hexo_pro.password) {
            return res.done({ code: -1, msg: 'username or password err' })
        }
        const tk = jwt.sign({ username: hexo.config.hexo_pro.username, avata: hexo.config.hexo_pro.avata }, hexo.config.hexo_pro.secret, { expiresIn: 60 * 60 * 24 })
        return res.done({ code: 0, token: tk })
    })

    use('userInfo', function (req, res, next) {
        if (!needLogin) {
            res.done({ username: 'HexoPRO', avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mJ8BAEAAAAALAAD4Z8AAAAASUVORK5CYII=' })
        }
        res.done({ username: hexo.config.hexo_pro.username, avatar: hexo.config.hexo_pro.avatar })
    })
}