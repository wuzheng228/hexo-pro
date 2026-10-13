const { query, validSecret, hashSecret, verifySecret, migrateCredentials, credentialSnapshot, signUserToken, ensureJwtSecret } = require('./auth_security');

module.exports = function (app, hexo, use, db) {
    const { userDb, settingsDb } = db;
    const handle = action => async (req, res, next) => {
        try { await action(req, res, next); }
        catch (error) { res.done({ code: error.statusCode || 500, msg: error.statusCode ? error.message : '账号操作失败，请稍后重试' }); }
    };
    const validUsername = username => typeof username === 'string' && username.length > 0 && username.length <= 128;

    use('login', handle(async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const { username, password } = req.body || {};
        if (!validUsername(username) || !validSecret(password)) return res.done({ code: -1, msg: 'login.form.login.errMsg' });
        let user = await query(userDb, 'findOne', { username });
        if (!user || user.isTemporary || !(await verifySecret(password, user.password))) {
            return res.done({ code: -1, msg: 'login.form.login.errMsg' });
        }
        user = await migrateCredentials(userDb, user);
        const current = await query(userDb, 'findOne', { _id: user._id });
        // A password reset between credential checking and token issuance must not
        // mint a fresh session for the old password.
        if (!current || current.password !== user.password || (current.tokenVersion || 0) !== (user.tokenVersion || 0)) {
            return res.done({ code: -1, msg: 'login.form.login.errMsg' });
        }
        const secret = await ensureJwtSecret(settingsDb);
        res.done({ code: 0, msg: '登录成功', token: signUserToken(current, secret) });
    }));

    use('userInfo', handle(async (req, res) => {
        if (!req.auth) return res.done({ code: 401, msg: '未授权或Token无效' });
        const user = await query(userDb, 'findOne', { _id: req.auth.userId });
        if (!user) return res.done({ code: 404, msg: '用户不存在' });
        res.done({ avatar: user.avatar || '', name: user.username });
    }));

    use('auth/security-question', handle(async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const { username } = req.body || {};
        if (!validUsername(username)) return res.done({ code: 400, msg: '请输入用户名' });
        const user = await query(userDb, 'findOne', { username });
        if (!user) return res.done({ code: 404, msg: '用户不存在' });
        const securityQuestion = String(user.securityQuestion || '').trim();
        if (!securityQuestion) return res.done({ code: 400, msg: '该账号未设置安全问题，无法显示提示信息' });
        res.done({ code: 0, data: { securityQuestion } });
    }));

    use('auth/reset-password', handle(async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const { username, securityAnswer, newPassword, confirmPassword } = req.body || {};
        if (!validUsername(username) || typeof securityAnswer !== 'string' || !validSecret(securityAnswer.trim())
            || !validSecret(newPassword) || !confirmPassword) return res.done({ code: 400, msg: '请填写完整信息' });
        if (newPassword !== confirmPassword) return res.done({ code: 400, msg: '两次输入的密码不一致' });
        if (newPassword.length < 6) return res.done({ code: 400, msg: '密码长度不能少于6位' });
        const user = await query(userDb, 'findOne', { username });
        const answer = user && (user.securityAnswer || user.resetToken);
        if (!user || !answer || !(await verifySecret(securityAnswer.trim(), answer))) {
            return res.done({ code: 400, msg: '用户名或安全问题答案错误' });
        }
        const passwordHash = await hashSecret(newPassword);
        const answerHash = await hashSecret(securityAnswer.trim());
        const changed = await query(userDb, 'update', credentialSnapshot(user),
            { $set: { password: passwordHash, securityAnswer: answerHash, updatedAt: new Date() },
                $inc: { tokenVersion: 1 }, $unset: { resetToken: true } }, {});
        if (!changed) return res.done({ code: 409, msg: '账号信息已改变，请重新操作' });
        res.done({ code: 0, msg: '密码重置成功，请使用新密码登录' });
    }));
};
