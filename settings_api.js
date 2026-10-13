const fs = require('fs');
const path = require('path');
const { query, validSecret, hashSecret, credentialSnapshot, signUserToken, ensureJwtSecret } = require('./auth_security');

module.exports = function(app, hexo, use, db) {
  const { userDb, settingsDb } = db;
  let setupBusy = false;
  const handle = action => async (req, res, next) => {
    try { await action(req, res, next); }
    catch (error) { res.done({ code: error.statusCode || 500, msg: error.statusCode ? error.message : '保存账号设置失败' }); }
  };
  const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
  const validUsername = value => typeof value === 'string' && value.trim() && value.length <= 128;
  const validatePassword = (password, confirmation) => {
    if (!validSecret(password) || password.length < 6) throw invalid('密码长度须为6位以上，且不能超过4096字节');
    if (password !== confirmation) throw invalid('两次输入的密码不一致');
  };
  const answerHash = async value => {
    if (typeof value !== 'string') throw invalid('安全答案格式无效');
    return value.trim() ? hashSecret(value.trim()) : '';
  };

  use('settings/check-first-use', handle(async (req, res) => {
    const users = await query(userDb, 'find', {});
    res.done({ code: 0, data: { isFirstUse: !users.some(user => !user.isTemporary),
      hasTemporaryUser: users.some(user => user.isTemporary) } });
  }));

  use('settings/register', handle(async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const { username, password, confirmPassword, avatar, securityQuestion, securityAnswer } = req.body || {};
    if (!validUsername(username)) throw invalid('请输入有效用户名');
    validatePassword(password, confirmPassword);
    if (setupBusy) return res.done({ code: 409, msg: '账号正在初始化，请稍后重试' });
    setupBusy = true;
    try {
      const users = await query(userDb, 'find', {});
      if (users.some(user => !user.isTemporary)) return res.done({ code: 403, msg: '系统已初始化，不能再次注册' });
      const passwordHash = await hashSecret(password);
      const securityAnswerHash = securityAnswer === undefined ? '' : await answerHash(securityAnswer);
      const secret = await ensureJwtSecret(settingsDb);
      const user = await query(userDb, 'insert', { username, password: passwordHash, avatar: avatar || '',
        isTemporary: false, tokenVersion: 0, securityQuestion: String(securityQuestion || '').trim(),
        securityAnswer: securityAnswerHash, createdAt: new Date(), updatedAt: new Date() });
      global.actualNeedLogin = true;
      await query(settingsDb, 'insert', { username, menuCollapsed: false, createdAt: new Date(), updatedAt: new Date() });
      await query(userDb, 'remove', { isTemporary: true }, { multi: true });
      const temporaryNames = users.filter(user => user.isTemporary && user.username !== username).map(user => user.username);
      if (temporaryNames.length) await query(settingsDb, 'remove', { username: { $in: temporaryNames } }, { multi: true });
      res.done({ code: 0, msg: '注册成功', data: { token: signUserToken(user, secret), username, avatar: user.avatar } });
    } finally { setupBusy = false; }
  }));

  // The explicit skip action retains the existing temporary-account workflow.
  use('settings/skip-setup', handle(async (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (setupBusy) return res.done({ code: 409, msg: '账号正在初始化，请稍后重试' });
    setupBusy = true;
    try {
      const users = await query(userDb, 'find', {});
      if (users.some(user => !user.isTemporary)) return res.done({ code: 403, msg: '系统已初始化，不能跳过设置' });
      const secret = await ensureJwtSecret(settingsDb);
      let user = users.find(user => user.isTemporary);
      if (!user) {
        user = await query(userDb, 'insert', { username: 'temp_user_' + Date.now(), password: null,
          avatar: '', isTemporary: true, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() });
        await query(settingsDb, 'insert', { username: user.username, menuCollapsed: false, createdAt: new Date(), updatedAt: new Date() });
      }
      global.actualNeedLogin = true;
      res.done({ code: 0, msg: '已跳过设置，可稍后在设置页面配置账号密码',
        data: { token: signUserToken(user, secret, '30d'), username: user.username, isTemporary: true } });
    } finally { setupBusy = false; }
  }));

  use('settings', handle(async (req, res) => {
    if (!req.auth) return res.done({ code: 401, msg: '未授权' });
    const user = await query(userDb, 'findOne', { _id: req.auth.userId });
    if (!user) return res.done({ code: 404, msg: '用户不存在' });
    const settings = await query(settingsDb, 'findOne', { username: user.username });
    res.done({ code: 0, data: { username: user.username, avatar: user.avatar || '', menuCollapsed: settings?.menuCollapsed || false } });
  }));

  use('settings/update', handle(async (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (!req.auth) return res.done({ code: 401, msg: '未授权' });
    const user = await query(userDb, 'findOne', { _id: req.auth.userId });
    if (!user) return res.done({ code: 404, msg: '用户不存在' });
    const { username, avatar, password, confirmPassword, menuCollapsed, securityQuestion, securityAnswer } = req.body || {};
    const changes = { updatedAt: new Date() };
    if (username !== undefined) {
      if (!validUsername(username)) throw invalid('请输入有效用户名');
      if (username !== user.username && await query(userDb, 'findOne', { username })) throw invalid('用户名已存在');
      changes.username = username;
    }
    if (avatar !== undefined) changes.avatar = avatar;
    if (password) {
      validatePassword(password, confirmPassword);
      changes.password = await hashSecret(password);
      if (user.isTemporary) changes.isTemporary = false;
    }
    if (securityQuestion !== undefined) changes.securityQuestion = String(securityQuestion || '').trim();
    if (securityAnswer !== undefined) changes.securityAnswer = await answerHash(securityAnswer);
    const revoke = Boolean(password || (username && username !== user.username));
    const update = { $set: changes };
    if (revoke) update.$inc = { tokenVersion: 1 };
    if (securityAnswer !== undefined) update.$unset = { resetToken: true };
    const changed = await query(userDb, 'update', credentialSnapshot(user), update, {});
    if (!changed) return res.done({ code: 409, msg: '账号信息已改变，请刷新后重试' });
    const finalUsername = changes.username || user.username;
    const settingsChanges = { username: finalUsername, updatedAt: new Date() };
    if (menuCollapsed !== undefined) settingsChanges.menuCollapsed = menuCollapsed;
    await query(settingsDb, 'update', { username: user.username }, { $set: settingsChanges }, { upsert: true });
    if (revoke) {
      const current = await query(userDb, 'findOne', { _id: user._id });
      const secret = await ensureJwtSecret(settingsDb);
      res.done({ code: 0, msg: '设置已更新', data: { token: signUserToken(current, secret), username: finalUsername } });
    } else res.done({ code: 0, msg: '设置已更新' });
  }));

  // 上传头像
  use('settings/upload-avatar', function(req, res) {
    // 修改这里：使用 req.auth
    const username = req.auth ? req.auth.username : null;
    
    if (!username) {
      return res.done({ code: 401, msg: '未授权' });
    }

    const { data, filename } = req.body;
    
    if (!data || !filename) {
      return res.done({ code: 400, msg: '缺少必要参数' });
    }

    // 使用图床API上传头像
    // 直接调用 image_api.js 中的上传图片功能
    // 将头像上传到图床根目录
    
    // 处理Base64图片数据
    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.done({ code: 400, msg: '无效的图片数据' });
    }
    
    const type = matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');
    
    // 生成文件名 - 使用avatar_前缀以便识别
    const ext = path.extname(filename);
    const newFilename = `avatar_${username}_${Date.now()}${ext}`;
    
    // 确定保存路径 - 使用图床根目录
    const imagesDir = path.join(hexo.source_dir, 'images');
    
    // 确保目录存在
    fs.ensureDirSync(imagesDir);
    
    const filePath = path.join(imagesDir, newFilename);
    
    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      // 如果文件已存在，添加时间戳
      const nameWithoutExt = newFilename.substring(0, newFilename.lastIndexOf('.'));
      const extension = newFilename.substring(newFilename.lastIndexOf('.'));
      newFilename = `${nameWithoutExt}_${Date.now()}${extension}`;
    }
    
    const finalFilePath = path.join(imagesDir, newFilename);
    
    try {
      fs.writeFileSync(finalFilePath, imageBuffer);
      
      // 返回图片URL - 使用图床的URL格式
      const relativePath = `images/${newFilename}`;
      const avatarUrl = hexo.config.url + `/${relativePath}`;
      
      // 更新用户头像URL
      userDb.update({ username }, { $set: { avatar: avatarUrl, updatedAt: new Date() } }, {}, (err) => {
        if (err) {
          return res.done({ code: 500, msg: '更新头像信息失败' });
        }
        
        res.done({ 
          code: 0, 
          msg: '头像上传成功', 
          data: { 
            url: avatarUrl,
            path: relativePath,
            name: newFilename
          } 
        });
      });
    } catch (err) {
      console.error('保存头像失败:', err);
      res.done({ code: 500, msg: '保存头像失败: ' + err.message });
    }
  });

};
