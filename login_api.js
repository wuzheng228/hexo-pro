
const jwt = require('jsonwebtoken');

// 移除 _needLogin 和 _jwtSecret 参数
module.exports = function (app, hexo, use, db) {
    const { userDb, settingsDb } = db; // 从 db 中解构 settingsDb

    use('login', function (req, res) {
        // 使用全局变量 global.actualNeedLogin
        if (!global.actualNeedLogin) {
            return res.done({
                code: -2,
                msg: '未配置登录信息，无需登录'
            });
        }

        const { username, password } = req.body;

        // 使用 NeDB 查询用户
        userDb.findOne({ username }, (err, user) => {
            if (err) {
                return res.done({
                    code: 500,
                    msg: '服务器错误'
                });
            }

            if (!user || user.password.toString() !== password) {
                return res.done({
                    code: -1,
                    msg: 'login.form.login.errMsg'
                });
            }

            // 使用全局变量 global.jwtSecret
            if (!global.jwtSecret) {
                 // 尝试从数据库再次加载，以防万一初始化时 global 未设置
                 settingsDb.findOne({ type: 'system' }, (err, settings) => {
                     if (!err && settings && settings.jwtSecret) {
                         global.jwtSecret = settings.jwtSecret;
                         // 继续生成 token
                         generateTokenAndRespond(user, res);
                     } else {
                         console.error('[Hexo Pro Login]: JWT Secret 在登录时仍未配置!');
                         return res.done({
                             code: 500,
                             msg: '系统错误：JWT 密钥未配置'
                         });
                     }
                 });
            } else {
                 // 直接生成 token
                 generateTokenAndRespond(user, res);
            }
        });
    });

    // 辅助函数用于生成 Token 和响应
    function generateTokenAndRespond(user, res) {
        const token = jwt.sign(
            { username: user.username },
            global.jwtSecret,
            { expiresIn: '7d' }
        );

        res.done({
            code: 0,
            msg: '登录成功',
            token
        });
    }


    use('userInfo', function (req, res) {
         // 使用全局变量 global.actualNeedLogin
        if (!global.actualNeedLogin) {
            // 如果不需要登录，可以返回一个默认用户或空信息
            return res.done({
                avatar: '',
                name: 'Guest' // 或者 'Admin'，根据你的逻辑
            });
        }

        // 调试信息
        // console.log('userInfo接口被调用');
        // console.log('请求头:', req.headers);
        // console.log('Authorization:', req.headers.authorization);
        // console.log('req.auth:', req.auth);

        let username = null;

        // 首先尝试从req.auth获取用户名
        if (req.auth && req.auth.username) {
            username = req.auth.username;
            // console.log('从req.auth获取到用户名:', username);
        }
        // 如果req.auth不存在，尝试手动解析token
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                console.log('尝试手动解析token:', token);

                 // 使用全局变量 global.jwtSecret
                if (token && global.jwtSecret) {
                    const decoded = jwt.verify(token, global.jwtSecret);
                    console.log('手动解析token结果:', decoded);

                    if (decoded && decoded.username) {
                        username = decoded.username;
                        console.log('从token中获取到用户名:', username);
                    }
                } else if (token && !global.jwtSecret) {
                     console.warn('[Hexo Pro UserInfo]: 尝试解析Token但 global.jwtSecret 未设置');
                }
            } catch (error) {
                console.error('解析token失败:', error.message);
                 // 如果 token 无效或过期，也视为未授权
                 return res.done({
                     code: 401,
                     msg: 'Token无效或已过期'
                 });
            }
        }

        if (!username) {
            console.log('未获取到用户名，返回401');
            return res.done({
                code: 401,
                msg: '未授权或Token无效' // 更明确的错误信息
            });
        }

        // 从数据库获取用户信息
        userDb.findOne({ username }, (err, user) => {
            if (err) {
                console.log('数据库查询错误:', err);
                return res.done({
                    code: 500,
                    msg: '获取用户信息失败'
                });
            }

            if (!user) {
                console.log('用户不存在:', username);
                return res.done({
                    code: 404,
                    msg: '用户不存在'
                });
            }

            // console.log('成功获取用户信息:', username);
            res.done({
                avatar: user.avatar || '',
                name: user.username
            });
        });
    });
};
