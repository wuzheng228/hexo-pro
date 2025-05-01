
const jwt = require('jsonwebtoken');

module.exports = function (app, hexo, use, _needLogin, db, _jwtSecret) {
    // 注意：我们不再使用参数 needLogin 和 jwtSecret，而是使用全局变量 global.actualNeedLogin 和 global.jwtSecret
    const { userDb } = db;

    use('login', function (req, res) {
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

            if (!user || user.password !== password) {
                return res.done({
                    code: -1,
                    msg: '用户名或密码错误'
                });
            }

            // 从数据库获取 JWT secret
            db.settingsDb.findOne({ type: 'system' }, (err, settings) => {
                // 优先使用数据库中的 JWT secret，如果没有则使用全局变量
                if (!err && settings && settings.jwtSecret) {
                    global.jwtSecret = settings.jwtSecret;
                }
                
                if (!global.jwtSecret) {
                    return res.done({
                        code: 500,
                        msg: '系统错误：JWT 密钥未配置'
                    });
                }
                
                // 生成 JWT token
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
            });
        });
    });

    use('userInfo', function (req, res) {
        if (!global.actualNeedLogin) {
            return res.done({
                avatar: '',
                name: 'Admin'
            });
        }

        // 调试信息
        console.log('userInfo接口被调用');
        console.log('请求头:', req.headers);
        console.log('Authorization:', req.headers.authorization);
        console.log('req.auth:', req.auth);
        
        let username = null;
        
        // 首先尝试从req.auth获取用户名
        if (req.auth && req.auth.username) {
            username = req.auth.username;
            console.log('从req.auth获取到用户名:', username);
        } 
        // 如果req.auth不存在，尝试手动解析token
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                console.log('尝试手动解析token:', token);
                
                if (token && global.jwtSecret) {
                    const decoded = jwt.verify(token, global.jwtSecret);
                    console.log('手动解析token结果:', decoded);
                    
                    if (decoded && decoded.username) {
                        username = decoded.username;
                        console.log('从token中获取到用户名:', username);
                    }
                }
            } catch (error) {
                console.error('解析token失败:', error.message);
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

            console.log('成功获取用户信息:', username);
            res.done({
                avatar: user.avatar || '',
                name: user.username
            });
        });
    });
};
