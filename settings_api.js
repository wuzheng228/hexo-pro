const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require('jsonwebtoken');

module.exports = function(app, hexo, use, db) {
  const { userDb, settingsDb } = db;

  // 添加检查是否首次使用的API
  use('settings/check-first-use', function(req, res) {
    userDb.count({}, (err, count) => {
      if (err) {
        return res.done({ code: 500, msg: '检查系统状态失败' });
      }
      // console.log({
      //   code: 0,
      //   data: {
      //     isFirstUse: count === 0
      //   }
      // })
      // 返回是否是首次使用（没有用户）
      res.done({
        code: 0,
        data: {
          isFirstUse: count === 0
        }
      });
    });
  });

  // 添加首次使用注册API
  use('settings/register', function(req, res) {
    // 检查是否已有用户
    userDb.count({}, (err, count) => {
      if (err) {
        return res.done({ code: 500, msg: '检查系统状态失败' });
      }
      
      // 如果已有用户，不允许注册
      if (count > 0) {
        return res.done({ code: 403, msg: '系统已初始化，不能再次注册' });
      }
      
      const { username, password, confirmPassword, avatar } = req.body;
      
      // 验证输入
      if (!username || !password) {
        return res.done({ code: 400, msg: '用户名和密码不能为空' });
      }
      
      if (password !== confirmPassword) {
        return res.done({ code: 400, msg: '两次输入的密码不一致' });
      }
      
      // 创建新用户
      const newUser = {
        username,
        password,
        avatar: avatar || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      userDb.insert(newUser, (err) => {
        if (err) {
          return res.done({ code: 500, msg: '创建用户失败' });
        }
        
        // 创建默认设置
        const newSettings = {
          username,
          menuCollapsed: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        settingsDb.insert(newSettings, (err) => {
          if (err) {
            return res.done({ code: 500, msg: '创建设置失败' });
          }
          
          // 创建系统设置，生成JWT密钥
          const jwtSecret = require('crypto').randomBytes(64).toString('hex');
          // 同时更新全局变量
          global.jwtSecret = jwtSecret;
          
          settingsDb.insert({
            type: 'system',
            jwtSecret: global.jwtSecret,
            createdAt: new Date()
          }, (err) => {
            if (err) {
              return res.done({ code: 500, msg: '创建系统设置失败' });
            }
            
            // 返回成功信息和JWT令牌
            const jwt = require('jsonwebtoken');
            const token = jwt.sign({ username }, global.jwtSecret, { expiresIn: '7d' });
            
            // 更新全局的needLogin状态为true
            global.actualNeedLogin = true;
            console.log('[Hexo Pro]: 用户注册成功，已更新登录验证状态为true');
            
            res.done({
              code: 0,
              msg: '注册成功',
              data: {
                token,
                username,
                avatar: newUser.avatar
              }
            });
          });
        });
      });
    });
  });

  // 获取当前用户设置
  use('settings', function(req, res) {
    // 修改这里：使用 req.auth
    let username = req.auth ? req.auth.username : null;
  
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
      return res.done({ code: 401, msg: '未授权' });
    }

    userDb.findOne({ username }, (err, user) => {
      if (err) {
        return res.done({ code: 500, msg: '获取用户信息失败' });
      }

      if (!user) {
        return res.done({ code: 404, msg: '用户不存在' });
      }

      // 获取用户设置
      settingsDb.findOne({ username }, (err, settings) => {
        if (err) {
          return res.done({ code: 500, msg: '获取设置失败' });
        }

        // 返回用户信息和设置
        res.done({
          code: 0,
          data: {
            username: user.username,
            avatar: user.avatar || '',
            menuCollapsed: settings ? settings.menuCollapsed : false
          }
        });
      });
    });
  });

  // 更新用户设置
  use('settings/update', function(req, res) {
    // 修改这里：使用 req.auth
    let username = req.auth ? req.auth.username : null;
    
    

    if (req.auth && req.auth.username) {
      username = req.auth.username;
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

    

    const { avatar, password, confirmPassword, menuCollapsed } = req.body;

    // 验证密码
    if (password && password !== confirmPassword) {
      return res.done({ code: 400, msg: '两次输入的密码不一致' });
    }

    // 更新用户信息
    userDb.findOne({ username }, (err, user) => {
      if (err || !user) {
        return res.done({ code: 500, msg: '获取用户信息失败' });
      }

      const updateData = {};
      
      // 只更新提供的字段
      if (avatar !== undefined) {
        updateData.avatar = avatar;
      }
      
      if (password) {
        updateData.password = password;
      }

      updateData.updatedAt = new Date();

      userDb.update({ username }, { $set: updateData }, { upsert: false }, (err) => {
        if (err) {
          return res.done({ code: 500, msg: '更新用户信息失败' });
        }

        // 更新设置
        settingsDb.findOne({ username }, (err, settings) => {
          if (err) {
            return res.done({ code: 500, msg: '获取设置失败' });
          }

          if (settings) {
            // 更新现有设置
            settingsDb.update(
              { username }, 
              { $set: { menuCollapsed, updatedAt: new Date() } }, 
              {}, 
              (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '更新设置失败' });
                }
                
                // 如果更新了密码，同时更新配置文件
                if (password) {
                  updateConfigFile(username, password);
                }
                
                res.done({ code: 0, msg: '设置已更新' });
              }
            );
          } else {
            // 创建新设置
            const newSettings = {
              username,
              menuCollapsed,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            settingsDb.insert(newSettings, (err) => {
              if (err) {
                return res.done({ code: 500, msg: '创建设置失败' });
              }
              
              // 如果更新了密码，同时更新配置文件
              if (password) {
                updateConfigFile(username, password);
              }
              
              res.done({ code: 0, msg: '设置已创建' });
            });
          }
        });
      });
    });
  });

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

  // 更新配置文件中的用户名和密码
  function updateConfigFile(username, password) {
    try {
      // 更新数据库中的用户信息
      userDb.update(
        { username }, 
        { $set: { password, updatedAt: new Date() } }, 
        {}, 
        (err) => {
          if (err) {
            console.error('[Hexo Pro]: 更新用户密码失败', err);
            return;
          }
          
          console.log('[Hexo Pro]: 已更新数据库中的用户密码');
          
          // 更新或创建系统设置中的 JWT secret
          settingsDb.findOne({ type: 'system' }, (err, settings) => {
            if (err) {
              console.error('[Hexo Pro]: 获取系统设置失败', err);
              return;
            }
            
            const jwtSecret = require('crypto').randomBytes(64).toString('hex');
            
            if (settings) {
              // 更新现有设置
              settingsDb.update(
                { type: 'system' }, 
                { $set: { jwtSecret, updatedAt: new Date() } }, 
                {}, 
                (err) => {
                  if (err) {
                    console.error('[Hexo Pro]: 更新 JWT 密钥失败', err);
                  } else {
                    console.log('[Hexo Pro]: 已更新 JWT 密钥');
                  }
                }
              );
            } else {
              // 创建新设置
              settingsDb.insert({
                type: 'system',
                jwtSecret,
                createdAt: new Date(),
                updatedAt: new Date()
              }, (err) => {
                if (err) {
                  console.error('[Hexo Pro]: 创建系统设置失败', err);
                } else {
                  console.log('[Hexo Pro]: 已创建系统设置并保存 JWT 密钥');
                }
              });
            }
          });
        }
      );
      
      // 注意：不再更新 _config.yml 文件
      console.log('[Hexo Pro]: 用户信息现在仅保存在数据库中，不再更新配置文件');
      
    } catch (error) {
      console.error('[Hexo Pro]: 更新用户信息失败', error);
      throw error; // 抛出异常以便上层函数知道更新失败
    }
  }
};