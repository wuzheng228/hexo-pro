module.exports = function (app, hexo, use) {
    
    /**
     * 验证token有效性
     * GET /hexopro/api/auth/validate
     */
    use('auth/validate', function (req, res) {
        try {
            // 如果请求能到达这里，说明JWT中间件已经验证了token
            // req.auth 包含解码后的token信息（由express-jwt设置）
            
            if (req.auth && req.auth.userId) {
                // token有效，返回用户基本信息
                res.done({
                    valid: true,
                    userId: req.auth.userId,
                    username: req.auth.username,
                    message: 'Token验证成功'
                });
            } else {
                // 理论上不会到达这里，因为JWT中间件会先拦截
                res.send(401, 'Token验证失败');
            }
        } catch (error) {
            console.error('Token验证过程中出错:', error);
            res.send(500, 'Token验证失败');
        }
    });

    /**
     * 获取当前用户信息
     * GET /hexopro/api/auth/user
     */
    use('auth/user', function (req, res) {
        try {
            if (req.auth && req.auth.userId) {
                res.done({
                    userId: req.auth.userId,
                    username: req.auth.username,
                    role: req.auth.role || 'user',
                    message: '获取用户信息成功'
                });
            } else {
                res.send(401, '未授权访问');
            }
        } catch (error) {
            console.error('获取用户信息失败:', error);
            res.send(500, '获取用户信息失败');
        }
    });

    /**
     * 检查权限状态（无需token）
     * GET /hexopro/api/auth/status
     */
    use('auth/status', function (req, res) {
        try {
            // 这个接口不需要token验证，用于检查系统是否启用了认证
            res.done({
                authEnabled: global.actualNeedLogin || false,
                message: global.actualNeedLogin ? '系统已启用认证' : '系统未启用认证'
            });
        } catch (error) {
            console.error('获取认证状态失败:', error);
            res.send(500, '获取认证状态失败');
        }
    });

    /**
     * 刷新token（可选功能）
     * POST /hexopro/api/auth/refresh
     */
    use('auth/refresh', function (req, res, next) {
        if (req.method !== 'POST') return next();
        
        try {
            if (req.auth && req.auth.userId) {
                const jwt = require('jsonwebtoken');
                
                // 生成新的token
                const newToken = jwt.sign(
                    { 
                        userId: req.auth.userId, 
                        username: req.auth.username,
                        role: req.auth.role || 'user'
                    },
                    global.jwtSecret,
                    { expiresIn: '7d' }
                );

                res.done({
                    token: newToken,
                    expiresIn: '7d',
                    message: 'Token刷新成功'
                });
            } else {
                res.send(401, '未授权访问');
            }
        } catch (error) {
            console.error('刷新token失败:', error);
            res.send(500, '刷新token失败');
        }
    });
}; 