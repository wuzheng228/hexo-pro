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
      
      // 如果没有用户，直接返回首次使用
      if (count === 0) {
        return res.done({
          code: 0,
          data: {
            isFirstUse: true,
            hasTemporaryUser: false
          }
        });
      }
      
      // 如果有用户，检查是否只有临时用户
      userDb.find({}, (err, users) => {
        if (err) {
          return res.done({ code: 500, msg: '检查系统状态失败' });
        }
        
        // 检查是否所有用户都是临时用户
        const hasRealUser = users.some(user => !user.isTemporary);
        const hasTemporaryUser = users.some(user => user.isTemporary);
        
        if (!hasRealUser && hasTemporaryUser) {
          // 只有临时用户，仍然算是首次使用
          return res.done({
            code: 0,
            data: {
              isFirstUse: true,
              hasTemporaryUser: true
            }
          });
        } else if (hasRealUser) {
          // 有正式用户，不是首次使用
          return res.done({
            code: 0,
            data: {
              isFirstUse: false,
              hasTemporaryUser: hasTemporaryUser
            }
          });
        } else {
          // 理论上不会到达这里，但为了安全起见
          return res.done({
            code: 0,
            data: {
              isFirstUse: true,
              hasTemporaryUser: false
            }
          });
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
      
      // 如果没有用户，直接允许注册
      if (count === 0) {
        proceedWithRegistration();
      } else {
        // 如果有用户，检查是否只有临时用户
        userDb.find({}, (err, users) => {
          if (err) {
            return res.done({ code: 500, msg: '检查系统状态失败' });
          }
          
          const hasRealUser = users.some(user => !user.isTemporary);
          const tempUsers = users.filter(user => user.isTemporary);
          
          if (hasRealUser) {
            // 已有正式用户，不允许注册
            return res.done({ code: 403, msg: '系统已初始化，不能再次注册' });
          } else if (tempUsers.length > 0) {
            // 只有临时用户，可以注册正式用户，但需要先清理临时用户
            cleanupTemporaryUsersAndProceed(tempUsers);
          } else {
            // 理论上不会到达这里，但为了安全起见，允许注册
            proceedWithRegistration();
          }
        });
      }
      
      // 清理临时用户并继续注册
      function cleanupTemporaryUsersAndProceed(tempUsers) {
        console.log('[Hexo Pro]: 清理临时用户，准备注册正式用户');
        
        // 删除所有临时用户
        const tempUsernames = tempUsers.map(user => user.username);
        
        // 删除临时用户记录
        userDb.remove({ isTemporary: true }, { multi: true }, (err) => {
          if (err) {
            console.error('[Hexo Pro]: 删除临时用户失败:', err);
            return res.done({ code: 500, msg: '清理临时用户失败' });
          }
          
          // 删除临时用户的设置
          settingsDb.remove({ username: { $in: tempUsernames } }, { multi: true }, (err) => {
            if (err) {
              console.error('[Hexo Pro]: 删除临时用户设置失败:', err);
              // 不阻止注册流程，继续执行
            }
            
            console.log('[Hexo Pro]: 临时用户清理完成，开始正式注册');
            proceedWithRegistration();
          });
        });
      }
      
      // 执行注册流程
      function proceedWithRegistration() {
        const { username, password, confirmPassword, avatar } = req.body;
        
        // 验证输入
        if (!username || !password) {
          return res.done({ code: 400, msg: '用户名和密码不能为空' });
        }
        
        if (password !== confirmPassword) {
          return res.done({ code: 400, msg: '两次输入的密码不一致' });
        }
        
        // 创建新用户（正式用户，不是临时用户）
        const newUser = {
          username,
          password,
          avatar: avatar || '',
          isTemporary: false, // 明确标记为正式用户
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
            
            // 确保系统设置存在，生成或更新JWT密钥
            ensureSystemSettings((jwtSecret) => {
              // 返回成功信息和JWT令牌
              const jwt = require('jsonwebtoken');
              const token = jwt.sign({ username }, jwtSecret, { expiresIn: '7d' });
              
              // 更新全局的needLogin状态为true（因为现在有正式用户了）
              global.actualNeedLogin = true;
              console.log('[Hexo Pro]: 正式用户注册成功，已更新登录验证状态为true');
              
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
      }
      
      // 确保系统设置存在的辅助函数
      function ensureSystemSettings(callback) {
        settingsDb.findOne({ type: 'system' }, (err, systemSettings) => {
          if (err) {
            return res.done({ code: 500, msg: '获取系统设置失败' });
          }
          
          if (systemSettings && systemSettings.jwtSecret) {
            // 使用现有的JWT密钥
            global.jwtSecret = systemSettings.jwtSecret;
            callback(systemSettings.jwtSecret);
          } else {
            // 生成新的JWT密钥
            const jwtSecret = require('crypto').randomBytes(64).toString('hex');
            global.jwtSecret = jwtSecret;
            
            const settingData = {
              type: 'system',
              jwtSecret: jwtSecret,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            if (systemSettings) {
              // 更新现有设置
              settingsDb.update({ type: 'system' }, { $set: settingData }, {}, (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '更新系统设置失败' });
                }
                callback(jwtSecret);
              });
            } else {
              // 创建新设置
              settingsDb.insert(settingData, (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '创建系统设置失败' });
                }
                callback(jwtSecret);
              });
            }
          }
        });
      }
    });
  });

  // 添加跳过设置API（用于首次使用时的免密登录）
  use('settings/skip-setup', function(req, res) {
    // 检查是否已有用户
    userDb.count({}, (err, count) => {
      if (err) {
        return res.done({ code: 500, msg: '检查系统状态失败' });
      }
      
      // 如果没有用户，创建临时用户
      if (count === 0) {
        createTemporaryUser();
      } else {
        // 如果有用户，检查是否存在临时用户
        userDb.find({}, (err, users) => {
          if (err) {
            return res.done({ code: 500, msg: '检查系统状态失败' });
          }
          
          const hasRealUser = users.some(user => !user.isTemporary);
          const tempUser = users.find(user => user.isTemporary);
          
          if (hasRealUser) {
            // 已有正式用户，不允许跳过设置
            return res.done({ code: 403, msg: '系统已初始化，不能跳过设置' });
          } else if (tempUser) {
            // 存在临时用户，为其生成新token
            generateTokenForUser(tempUser.username);
          } else {
            // 理论上不会到达这里，但为了安全起见，创建临时用户
            createTemporaryUser();
          }
        });
      }
      
      // 创建临时用户的函数
      function createTemporaryUser() {
        const tempUsername = 'temp_user_' + Date.now();
        const tempUser = {
          username: tempUsername,
          password: null, // 没有密码，表示临时用户
          avatar: '',
          isTemporary: true, // 标记为临时用户
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        userDb.insert(tempUser, (err) => {
          if (err) {
            return res.done({ code: 500, msg: '创建临时用户失败' });
          }
          
          // 创建默认设置
          const newSettings = {
            username: tempUsername,
            menuCollapsed: false,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          settingsDb.insert(newSettings, (err) => {
            if (err) {
              return res.done({ code: 500, msg: '创建设置失败' });
            }
            
            ensureJwtSecretAndGenerateToken(tempUsername);
          });
        });
      }
      
      // 为现有用户生成token的函数
      function generateTokenForUser(username) {
        ensureJwtSecretAndGenerateToken(username);
      }
      
      // 确保JWT密钥存在并生成token的函数
      function ensureJwtSecretAndGenerateToken(username) {
        // 检查是否存在JWT密钥
        settingsDb.findOne({ type: 'system' }, (err, systemSettings) => {
          if (err) {
            return res.done({ code: 500, msg: '获取系统设置失败' });
          }
          
          let jwtSecret = systemSettings ? systemSettings.jwtSecret : null;
          
          if (!jwtSecret) {
            // 创建JWT密钥
            jwtSecret = require('crypto').randomBytes(64).toString('hex');
            global.jwtSecret = jwtSecret;
            
            const settingData = {
              type: 'system',
              jwtSecret: jwtSecret,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            if (systemSettings) {
              // 更新现有设置
              settingsDb.update({ type: 'system' }, { $set: settingData }, {}, (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '更新系统设置失败' });
                }
                generateAndReturnToken(username, jwtSecret);
              });
            } else {
              // 创建新设置
              settingsDb.insert(settingData, (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '创建系统设置失败' });
                }
                generateAndReturnToken(username, jwtSecret);
              });
            }
          } else {
            // 使用现有的JWT密钥
            global.jwtSecret = jwtSecret;
            generateAndReturnToken(username, jwtSecret);
          }
        });
      }
      
      // 生成并返回token的函数
      function generateAndReturnToken(username, jwtSecret) {
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ username: username }, jwtSecret, { expiresIn: '30d' });
        
        // 暂时不更新全局的needLogin状态，保持为false以便后续可以设置正式账号
        global.actualNeedLogin = false;
        console.log('[Hexo Pro]: 用户选择跳过设置，使用临时账号:', username);
        
        res.done({
          code: 0,
          msg: '已跳过设置，可稍后在设置页面配置账号密码',
          data: {
            token,
            username: username,
            isTemporary: true
          }
        });
      }
    });
  });

  // 获取当前用户设置
  use('settings', function(req, res) {
    // 修改这里：使用 req.auth
    let username = req.auth ? req.auth.username : null;
  
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
    let currentUsername = req.auth ? req.auth.username : null;
    
    

    if (req.auth && req.auth.username) {
      currentUsername = req.auth.username;
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
                    currentUsername = decoded.username;
                    console.log('从token中获取到用户名:', currentUsername);
                }
            }
        } catch (error) {
            console.error('解析token失败:', error.message);
        }
    }

    if (!currentUsername) {
      return res.done({ code: 401, msg: '未授权' });
    }

    const { username: newUsername, avatar, password, confirmPassword, menuCollapsed } = req.body;

    // 验证密码
    if (password && password !== confirmPassword) {
      return res.done({ code: 400, msg: '两次输入的密码不一致' });
    }

    // 检查新用户名是否与其他用户冲突（如果用户名发生了变化）
    if (newUsername && newUsername !== currentUsername) {
      userDb.findOne({ username: newUsername }, (err, existingUser) => {
        if (err) {
          return res.done({ code: 500, msg: '检查用户名失败' });
        }
        
        if (existingUser) {
          return res.done({ code: 400, msg: '用户名已存在' });
        }
        
        // 用户名不冲突，继续更新流程
        proceedWithUpdate();
      });
    } else {
      // 用户名没有变化，直接更新
      proceedWithUpdate();
    }

    function proceedWithUpdate() {
      // 更新用户信息
      userDb.findOne({ username: currentUsername }, (err, user) => {
        if (err || !user) {
          return res.done({ code: 500, msg: '获取用户信息失败' });
        }

        const updateData = {};
        
        // 只更新提供的字段
        if (newUsername !== undefined && newUsername !== currentUsername) {
          updateData.username = newUsername;
        }
        
        if (avatar !== undefined) {
          updateData.avatar = avatar;
        }
        
        if (password) {
          updateData.password = password;
        }

        updateData.updatedAt = new Date();

        userDb.update({ username: currentUsername }, { $set: updateData }, { upsert: false }, (err) => {
          if (err) {
            return res.done({ code: 500, msg: '更新用户信息失败' });
          }

          const finalUsername = newUsername || currentUsername;

          // 更新设置
          settingsDb.findOne({ username: currentUsername }, (err, settings) => {
            if (err) {
              return res.done({ code: 500, msg: '获取设置失败' });
            }

            const settingsUpdateData = {
              username: finalUsername, // 如果用户名变了，也要更新设置中的用户名
              menuCollapsed,
              updatedAt: new Date()
            };

            if (settings) {
              // 更新现有设置
              settingsDb.update(
                { username: currentUsername }, 
                { $set: settingsUpdateData }, 
                {}, 
                (err) => {
                  if (err) {
                    return res.done({ code: 500, msg: '更新设置失败' });
                  }
                  
                  handlePostUpdateActions(finalUsername, password);
                }
              );
            } else {
              // 创建新设置
              const newSettings = {
                ...settingsUpdateData,
                createdAt: new Date()
              };
              
              settingsDb.insert(newSettings, (err) => {
                if (err) {
                  return res.done({ code: 500, msg: '创建设置失败' });
                }
                
                handlePostUpdateActions(finalUsername, password);
              });
            }
          });
        });
      });
    }

    function handlePostUpdateActions(finalUsername, password) {
      // 如果更新了密码，同时更新配置文件
      if (password) {
        updateConfigFile(finalUsername, password);
      }
      
      // 如果用户名发生了变化，需要生成新的token
      if (newUsername && newUsername !== currentUsername) {
        const jwt = require('jsonwebtoken');
        const newToken = jwt.sign({ username: finalUsername }, global.jwtSecret, { expiresIn: '7d' });
        
        res.done({ 
          code: 0, 
          msg: '设置已更新',
          data: {
            token: newToken, // 返回新的token
            username: finalUsername
          }
        });
      } else {
        res.done({ code: 0, msg: '设置已更新' });
      }
    }
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