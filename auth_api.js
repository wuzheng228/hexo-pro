const { query, signUserToken, ensureJwtSecret } = require('./auth_security');

module.exports = function (app, hexo, use, db) {
    use('auth/validate', function (req, res) {
        if (!req.auth?.userId) return res.send(401, 'Token验证失败');
        res.done({ valid: true, userId: req.auth.userId, username: req.auth.username, message: 'Token验证成功' });
    });

    use('auth/user', function (req, res) {
        if (!req.auth?.userId) return res.send(401, '未授权访问');
        res.done({ userId: req.auth.userId, username: req.auth.username, role: req.auth.role || 'user', message: '获取用户信息成功' });
    });

    use('auth/status', async function (req, res) {
        const count = await query(db.userDb, 'count', {});
        res.done({ authEnabled: count > 0, message: count > 0 ? '系统已启用认证' : '系统未启用认证' });
    });

    use('auth/refresh', async function (req, res, next) {
        if (req.method !== 'POST') return next();
        if (!req.auth?.userId) return res.send(401, '未授权访问');
        const user = await query(db.userDb, 'findOne', { _id: req.auth.userId });
        if (!user || (user.tokenVersion || 0) !== req.auth.tokenVersion) return res.send(401, 'Token已失效');
        const secret = await ensureJwtSecret(db.settingsDb);
        res.done({ token: signUserToken(user, secret), expiresIn: '7d', message: 'Token刷新成功' });
    });
};
