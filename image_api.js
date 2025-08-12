const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const utils = require('./utils');

// 第三方图床SDK
let aliOSS = null;
let qiniuSDK = null;
let tencentCOS = null;

// 尝试加载第三方SDK（这些是可选依赖）
try {
    aliOSS = require('ali-oss');
} catch (e) {
    console.log('[Image API] 阿里云OSS SDK未安装，跳过阿里云支持');
}

try {
    qiniuSDK = require('qiniu');
} catch (e) {
    console.log('[Image API] 七牛云SDK未安装，跳过七牛云支持');
}

try {
    tencentCOS = require('cos-nodejs-sdk-v5');
} catch (e) {
    console.log('[Image API] 腾讯云COS SDK未安装，跳过腾讯云支持');
}

// 获取图床配置的函数
function getStorageConfig() {
    // 从全局配置中读取，如果没有则使用默认值
    const config = global.hexoProStorageConfig || {
        type: 'local',
        customPath: 'images',
        aliyun: {},
        qiniu: {},
        tencent: {}
    };

    return config;
}

// 将 multer 提供的 originalname 从 latin1 纠正为 utf8，避免中文名乱码
function ensureUtf8Filename(name) {
    try {
        if (!name) return name;
        // Node/multer 常把 header 中的 filename 当作 latin1 解码
        // 这里转换为 UTF-8 字符串
        const decoded = Buffer.from(name, 'latin1').toString('utf8');
        return decoded || name;
    } catch (_) {
        return name;
    }
}

module.exports = function (app, hexo, use, db) {
    const settingsDb = db && db.settingsDb;

    // 从数据库加载图床配置到全局缓存
    const loadStorageConfigFromDb = () => {
        if (!settingsDb) return;
        settingsDb.findOne({ type: 'storage' }, (err, doc) => {
            if (err) {
                console.error('[Image API] 读取图床配置失败:', err);
                return;
            }
            if (doc && doc.storageConfig) {
                global.hexoProStorageConfig = doc.storageConfig;
                console.log('[Image API] 已从数据库加载图床配置:', global.hexoProStorageConfig);
            }
        });
    };

    const saveStorageConfigToDb = (config, cb) => {
        if (!settingsDb) return cb && cb();
        settingsDb.findOne({ type: 'storage' }, (findErr, doc) => {
            if (findErr) {
                console.error('[Image API] 查询图床配置失败:', findErr);
                return cb && cb(findErr);
            }
            const now = new Date();
            if (!doc) {
                const toInsert = {
                    type: 'storage',
                    storageConfig: config,
                    createdAt: now,
                    updatedAt: now
                };
                settingsDb.insert(toInsert, (insErr) => {
                    if (insErr) console.error('[Image API] 新建图床配置失败:', insErr);
                    cb && cb(insErr);
                });
            } else {
                settingsDb.update(
                    { type: 'storage' },
                    { $set: { storageConfig: config, updatedAt: now } },
                    {},
                    (updErr) => {
                        if (updErr) console.error('[Image API] 更新图床配置失败:', updErr);
                        cb && cb(updErr);
                    }
                );
            }
        });
    };

    // 初始化时尝试加载一次
    loadStorageConfigFromDb();

    // 设置图床配置API（持久化到 settings.db）
    use('images/config/set', function (req, res) {
        const { storageType, customPath, aliyunConfig, qiniuConfig, tencentConfig } = req.body;

        // 规范化配置
        const nextConfig = {
            type: (storageType || 'local'),
            customPath: customPath || 'images',
            aliyun: aliyunConfig || {},
            qiniu: qiniuConfig || {},
            tencent: tencentConfig || {}
        };

        // 更新全局缓存
        global.hexoProStorageConfig = nextConfig;

        // 持久化
        saveStorageConfigToDb(nextConfig, (err) => {
            if (err) {
                return res.done({ code: 500, msg: '保存图床配置失败' });
            }
            console.log('[Image API] 图床配置已更新并保存到数据库');
            res.done({
                code: 0,
                msg: '图床配置已保存',
                data: nextConfig
            });
        });
    });

    // 获取图床配置API（优先读数据库）
    use('images/config/get', function (req, res) {
        if (!settingsDb) {
            return res.done({ code: 0, data: getStorageConfig() });
        }
        settingsDb.findOne({ type: 'storage' }, (err, doc) => {
            if (err) {
                console.error('[Image API] 读取图床配置失败:', err);
                return res.done({ code: 0, data: getStorageConfig() });
            }
            const cfg = (doc && doc.storageConfig) ? doc.storageConfig : getStorageConfig();
            // 同步到全局缓存
            global.hexoProStorageConfig = cfg;
            res.done({ code: 0, data: cfg });
        });
    });

    // 配置multer存储
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            // 获取配置中的路径
            const config = getStorageConfig();
            const imagesDir = path.join(hexo.source_dir, config.customPath);
            fs.ensureDirSync(imagesDir);
            cb(null, imagesDir);
        },
        filename: function (req, file, cb) {
            // 生成唯一文件名
            const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    });

    // 创建multer上传实例
    const upload = multer({ storage: storage });

    // 获取图片列表（支持本地/阿里云/七牛云/腾讯云）
    use('images/list', async function (req, res) {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const folder = req.query.folder || '';
        const config = getStorageConfig();
        const type = ((req.query.storageType || config.type) || 'local').toLowerCase();

        try {
            if (type === 'local') {
                const imagesDir = path.join(hexo.source_dir, config.customPath);
                const targetDir = folder ? path.join(imagesDir, folder) : imagesDir;

                fs.ensureDirSync(imagesDir);
                fs.ensureDirSync(targetDir);

                const folders = [];
                try {
                    const items = fs.readdirSync(imagesDir);
                    items.forEach(item => {
                        const itemPath = path.join(imagesDir, item);
                        if (fs.statSync(itemPath).isDirectory()) {
                            folders.push(item);
                        }
                    });
                } catch (_) { }

                let images = [];
                try {
                    const items = fs.readdirSync(targetDir);
                    items.forEach(item => {
                        const itemPath = path.join(targetDir, item);
                        const stat = fs.statSync(itemPath);
                        if (stat.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item)) {
                            const relativePath = folder ? `${config.customPath}/${folder}/${item}` : `${config.customPath}/${item}`;
                            images.push({
                                name: item,
                                path: `/${relativePath}`,
                                url: `${hexo.config.url}/${relativePath}`,
                                size: stat.size,
                                lastModified: stat.mtime
                            });
                        }
                    });
                } catch (_) { }

                images.sort((a, b) => b.lastModified - a.lastModified);
                const total = images.length;
                const startIndex = (page - 1) * pageSize;
                const endIndex = startIndex + pageSize;
                const paginatedImages = images.slice(startIndex, endIndex);

                return res.done({
                    images: paginatedImages,
                    folders: folders,
                    total: total,
                    page: page,
                    pageSize: pageSize
                });
            }

            // 远程对象存储统一列举
            const allObjects = await listRemoteObjects(type, config);
            const imageObjects = allObjects.filter(obj => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(obj.key));

            const folderSet = new Set();
            const images = [];
            const now = Date.now();

            if (folder) {
                // 推导当前 folder 下的子文件夹（基于全部对象，保证空文件夹也可见）
                allObjects.forEach(obj => {
                    const key = obj.key;
                    if (!key.startsWith(folder + '/')) return;
                    const remaining = key.slice(folder.length + 1);
                    if (remaining.includes('/')) {
                        const sub = remaining.split('/')[0];
                        if (sub) folderSet.add(sub);
                    }
                });

                // 当前文件夹内的图片
                imageObjects.forEach(obj => {
                    const key = obj.key;
                    if (!key.startsWith(folder + '/')) return;
                    const remaining = key.slice(folder.length + 1);
                    if (!remaining.includes('/')) {
                        const url = buildObjectUrl(type, key, config);
                        images.push({
                            name: path.basename(key),
                            // 远程 path 使用对象 Key，供后续操作（移动等）
                            path: key,
                            url: url,
                            size: Number(obj.size || 0),
                            lastModified: obj.lastModified ? new Date(obj.lastModified) : new Date(now)
                        });
                    }
                });
            } else {
                // 顶层文件夹集合（基于全部对象，保证空文件夹也可见）
                allObjects.forEach(obj => {
                    const key = obj.key;
                    if (key.includes('/')) {
                        const top = key.split('/')[0];
                        if (top) folderSet.add(top);
                    }
                });

                // 顶层图片
                imageObjects.forEach(obj => {
                    const key = obj.key;
                    if (!key.includes('/')) {
                        const url = buildObjectUrl(type, key, config);
                        images.push({
                            name: path.basename(key),
                            path: key,
                            url: url,
                            size: Number(obj.size || 0),
                            lastModified: obj.lastModified ? new Date(obj.lastModified) : new Date(now)
                        });
                    }
                });
            }

            images.sort((a, b) => b.lastModified - a.lastModified);
            const total = images.length;
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedImages = images.slice(startIndex, endIndex);

            return res.done({
                images: paginatedImages,
                folders: Array.from(folderSet),
                total: total,
                page: page,
                pageSize: pageSize
            });
        } catch (err) {
            console.error('读取图片列表失败:', err);
            return res.send(500, '读取图片列表失败: ' + err.message);
        }
    });

    // 创建文件夹（本地/远程：远程通过创建占位对象实现）
    use('images/createFolder', async function (req, res) {
        const folderName = req.body.folderName;
        const reqType = ((req.body && req.body.storageType) || (getStorageConfig().type || 'local')).toLowerCase();

        if (!folderName) {
            return res.send(400, '文件夹名称不能为空');
        }

        // 验证文件夹名称 - 支持中文
        if (!/^[\w\u4e00-\u9fa5\-]+$/.test(folderName)) {
            return res.send(400, '文件夹名称只能包含字母、数字、下划线、短横线和中文');
        }

        if (reqType === 'local') {
            // 获取配置中的路径
            const config = getStorageConfig();
            const folderPath = path.join(hexo.source_dir, config.customPath, folderName);

            try {
                if (fs.existsSync(folderPath)) {
                    return res.send(400, '文件夹已存在');
                }

                fs.ensureDirSync(folderPath);
                return res.done({ success: true, folderName: folderName });
            } catch (err) {
                console.error('创建文件夹失败:', err);
                return res.send(500, '创建文件夹失败: ' + err.message);
            }
        }

        // 远程图床
        try {
            await createRemoteFolder(reqType, folderName, getStorageConfig());
            return res.done({ success: true, folderName: folderName });
        } catch (err) {
            console.error('远程图床创建文件夹失败:', err);
            return res.send(500, '远程图床创建文件夹失败: ' + err.message);
        }
    });

    // 删除文件夹（本地/远程）
    use('images/folder/delete', async function (req, res) {
        const { folder, storageType, recursive } = req.body || {};
        const config = getStorageConfig();
        const type = ((storageType) || config.type || 'local').toLowerCase();

        // 校验 folder
        if (!folder || typeof folder !== 'string') {
            return res.send(400, '文件夹名称不能为空');
        }
        const normalizedFolder = folder.replace(/^\/+/, '').replace(/\\/g, '/');
        if (normalizedFolder.includes('..')) {
            return res.send(400, '非法的文件夹路径');
        }

        try {
            if (type === 'local') {
                const baseDir = path.join(hexo.source_dir, config.customPath, normalizedFolder);
                if (!fs.existsSync(baseDir)) {
                    return res.send(404, '文件夹不存在');
                }
                if (recursive) {
                    fs.rmSync(baseDir, { recursive: true, force: true });
                    return res.done({ success: true });
                }
                // 非递归：要求空目录
                const items = fs.readdirSync(baseDir);
                if (items.length > 0) {
                    return res.send(409, '文件夹非空');
                }
                fs.rmdirSync(baseDir);
                return res.done({ success: true });
            }

            // 远程存储：按前缀删除
            const prefix = normalizedFolder.endsWith('/') ? normalizedFolder : normalizedFolder + '/';
            const allObjects = await listRemoteObjects(type, config);
            const inFolder = allObjects.filter(obj => obj.key.startsWith(prefix));

            if (!recursive) {
                // 仅当没有对象或仅有占位 .keep 时允许删除
                const realObjs = inFolder.filter(obj => path.basename(obj.key) !== '.keep');
                if (realObjs.length > 0) {
                    return res.send(409, '文件夹非空');
                }
                // 删除占位
                const keep = inFolder.find(obj => path.basename(obj.key) === '.keep');
                if (keep) {
                    await remoteDeleteObject(type, keep.key, config);
                }
                return res.done({ success: true });
            }

            // 递归删除全部对象
            const keys = inFolder.map(obj => obj.key);
            if (keys.length > 0) {
                await remoteBatchDeleteObjects(type, keys, config);
            }
            return res.done({ success: true });
        } catch (err) {
            console.error('删除文件夹失败:', err);
            return res.send(500, '删除文件夹失败: ' + err.message);
        }
    });

    // 删除图片（本地/远程）
    use('images/delete', async function (req, res) {
        const imagePath = req.body.path;
        if (!imagePath) {
            return res.send(400, '图片路径不能为空');
        }

        const config = getStorageConfig();
        const type = ((req.body && req.body.storageType) || (req.query && req.query.storageType) || config.type || 'local').toLowerCase();

        if (type === 'local') {
            const fullPath = path.join(hexo.source_dir, imagePath);
            try {
                if (!fs.existsSync(fullPath)) {
                    return res.send(404, '图片不存在');
                }
                fs.removeSync(fullPath);
                return res.done({ success: true });
            } catch (err) {
                console.error('删除图片失败:', err);
                return res.send(500, '删除图片失败: ' + err.message);
            }
        }

        // 远程删除
        try {
            const key = imagePath.replace(/^\/+/, '');
            await remoteDeleteObject(type, key, config);
            return res.done({ success: true });
        } catch (err) {
            console.error('远程图床删除失败:', err);
            return res.send(500, '远程图床删除失败: ' + err.message);
        }
    });

    // 上传图片 - 修改为支持表单数据上传和第三方图床
    use('images/upload', function (req, res, next) {
        const config = getStorageConfig();
        const reqType = (
            (req.body && req.body.storageType) ||
            (req.query && req.query.storageType) ||
            req.headers['x-storage-type'] ||
            config.type ||
            'local'
        ).toLowerCase();

        // 根据请求或配置的存储类型处理上传
        if (reqType === 'local') {
            handleLocalUpload(req, res, next, config);
        } else if (reqType === 'aliyun' && aliOSS) {
            handleAliyunUpload(req, res, config);
        } else if (reqType === 'qiniu' && qiniuSDK) {
            handleQiniuUpload(req, res, config);
        } else if (reqType === 'tencent' && tencentCOS) {
            handleTencentUpload(req, res, config);
        } else {
            // 如果第三方SDK未安装或配置不正确，回退到本地存储
            console.log(`[Image API] ${reqType} SDK未安装或配置不正确，回退到本地存储`);
            handleLocalUpload(req, res, next, config);
        }
    });

    // 本地存储处理函数
    function handleLocalUpload(req, res, next, config) {
        // 检查是否为表单数据上传
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            // 接收任意字段，支持多文件
            upload.any()(req, res, function (err) {
                if (err) {
                    console.error('文件上传失败:', err);
                    return res.send(500, '文件上传失败: ' + err.message);
                }

                const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
                if (!files || files.length === 0) {
                    return res.send(400, '没有上传文件');
                }

                try {
                    const folder = req.body.folder || '';
                    const sourceImagesDir = path.join(hexo.source_dir, config.customPath);
                    const targetDir = folder ? path.join(sourceImagesDir, folder) : sourceImagesDir;
                    fs.ensureDirSync(targetDir);

                    const results = [];
                    for (const f of files) {
                        let filename = req.body.filename || ensureUtf8Filename(f.originalname) || path.basename(f.filename);
                        if (!filename) filename = `${uuidv4()}${path.extname(f.originalname || '')}`;

                        let dstPath = path.join(targetDir, filename);
                        if (fs.existsSync(dstPath)) {
                            const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                            const extension = filename.substring(filename.lastIndexOf('.')) || '';
                            filename = `${nameWithoutExt}_${Date.now()}${extension}`;
                            dstPath = path.join(targetDir, filename);
                        }

                        fs.moveSync(f.path, dstPath, { overwrite: false });

                        const relativePath = folder ? `${config.customPath}/${folder}/${filename}` : `${config.customPath}/${filename}`;
                        results.push({
                            code: 0,
                            url: `${hexo.config.url}/${relativePath}`,
                            path: `/${relativePath}`,
                            name: filename,
                            src: `${hexo.config.url}/${relativePath}`
                        });
                    }

                    if (results.length === 1) {
                        return res.done(results[0]);
                    }
                    return res.done({ code: 0, items: results });
                } catch (err) {
                    console.error('保存图片失败:', err);
                    return res.send(500, '保存图片失败: ' + err.message);
                }
            });
        } else {
            // 处理Base64上传方式
            // 支持单个 { data, filename, folder } 或 items: [{...}, ...]
            const items = Array.isArray(req.body.items) ? req.body.items : null;
            const folder = req.body.folder || '';

            const processOne = (payload) => {
                const data = payload.data;
                let filename = payload.filename || '';
                const subFolder = payload.folder || folder || '';

                if (!data) throw new Error('图片数据不能为空');
                const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) throw new Error('无效的图片数据');
                const type = matches[1];
                const imageBuffer = Buffer.from(matches[2], 'base64');
                if (!filename) {
                    let extension = type.split('/')[1];
                    if (extension === 'svg+xml') extension = 'svg';
                    filename = `${uuidv4()}.${extension}`;
                } else {
                    let extension = type.split('/')[1];
                    if (extension === 'svg+xml') extension = 'svg';
                    if (!filename.endsWith(`.${extension}`)) filename = `${filename}.${extension}`;
                }

                const targetDir = subFolder ? path.join(hexo.source_dir, config.customPath, subFolder) : path.join(hexo.source_dir, config.customPath);
                fs.ensureDirSync(targetDir);
                let finalName = filename;
                let finalPath = path.join(targetDir, finalName);
                if (fs.existsSync(finalPath)) {
                    const nameWithoutExt = finalName.substring(0, finalName.lastIndexOf('.'));
                    const extension = finalName.substring(finalName.lastIndexOf('.'));
                    finalName = `${nameWithoutExt}_${Date.now()}${extension}`;
                    finalPath = path.join(targetDir, finalName);
                }
                fs.writeFileSync(finalPath, imageBuffer);
                const relativePath = subFolder ? `${config.customPath}/${subFolder}/${finalName}` : `${config.customPath}/${finalName}`;
                return {
                    code: 0,
                    url: `${hexo.config.url}/${relativePath}`,
                    path: `/${relativePath}`,
                    name: finalName,
                    src: `${hexo.config.url}/${relativePath}`
                };
            };

            try {
                if (items && items.length > 0) {
                    const results = [];
                    for (const it of items) {
                        try {
                            results.push(processOne(it));
                        } catch (e) {
                            results.push({ code: 500, msg: e.message, name: it.filename });
                        }
                    }
                    return res.done({ code: 0, items: results });
                } else {
                    const result = processOne(req.body);
                    return res.done(result);
                }
            } catch (err) {
                console.error('保存图片失败:', err);
                return res.send(500, '保存图片失败: ' + err.message);
            }
        }
    }

    // 重命名图片（本地/远程，仅更名不改目录）
    use('images/rename', async function (req, res) {
        const oldPath = req.body.oldPath;
        let newName = req.body.newName;

        if (!oldPath || !newName) {
            return res.send(400, '缺少必要参数');
        }

        // 验证新文件名 - 支持中文，禁止目录分隔符
        if (!/^[\w\u4e00-\u9fa5\-\.]+$/.test(newName) || /\//.test(newName)) {
            return res.send(400, '文件名不合法');
        }

        const config = getStorageConfig();
        const type = ((req.body && req.body.storageType) || config.type || 'local').toLowerCase();

        if (type === 'local') {
            const fullOldPath = path.join(hexo.source_dir, oldPath);
            if (!fs.existsSync(fullOldPath)) {
                return res.send(404, '图片不存在');
            }
            const dirName = path.dirname(fullOldPath);
            const originalExt = path.extname(fullOldPath);
            const newNameWithExt = newName.includes('.') ? newName : `${newName}${originalExt}`;
            const fullNewPath = path.join(dirName, newNameWithExt);
            if (fs.existsSync(fullNewPath)) {
                return res.send(400, '该文件名已存在');
            }
            try {
                fs.renameSync(fullOldPath, fullNewPath);
                const relativePath = path.relative(hexo.source_dir, fullNewPath).replace(/\\/g, '/');
                return res.done({
                    success: true,
                    newPath: `/${relativePath}`,
                    url: `${hexo.config.url}/${relativePath}`,
                    name: newNameWithExt
                });
            } catch (err) {
                console.error('重命名图片失败:', err);
                return res.send(500, '重命名图片失败: ' + err.message);
            }
        }

        // 远程：通过移动到同目录下的新文件名实现
        try {
            const srcKey = oldPath.replace(/^\/+/, '');
            const originalExt = path.extname(srcKey);
            const newNameWithExt = newName.includes('.') ? newName : `${newName}${originalExt}`;
            const dir = path.dirname(srcKey);
            const dstKey = dir && dir !== '.' ? `${dir}/${newNameWithExt}` : newNameWithExt;

            const finalKey = await moveRemoteObject(type, srcKey, dstKey, config);

            return res.done({
                success: true,
                newPath: finalKey,
                url: buildObjectUrl(type, finalKey, config),
                name: path.basename(finalKey)
            });
        } catch (err) {
            console.error('远程图床重命名失败:', err);
            return res.send(500, '远程图床重命名失败: ' + err.message);
        }
    });

    // 移动图片到指定文件夹（本地/远程）
    use('images/move', async function (req, res) {
        const imagePath = req.body.path;
        const targetFolder = req.body.targetFolder || '';

        if (!imagePath) {
            return res.send(400, '图片路径不能为空');
        }

        const config = getStorageConfig();
        const type = ((req.body && req.body.storageType) || (req.query && req.query.storageType) || config.type || 'local').toLowerCase();

        if (type === 'local') {
            const fullPath = path.join(hexo.source_dir, imagePath);

            if (!fs.existsSync(fullPath)) {
                return res.send(404, '图片不存在');
            }

            const fileName = path.basename(fullPath);
            const targetDir = targetFolder
                ? path.join(hexo.source_dir, config.customPath, targetFolder)
                : path.join(hexo.source_dir, config.customPath);

            // 确保目标目录存在
            fs.ensureDirSync(targetDir);

            let targetPath = path.join(targetDir, fileName);

            // 检查目标路径是否已存在同名文件
            if (fs.existsSync(targetPath)) {
                const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
                const extension = fileName.substring(fileName.lastIndexOf('.'));
                const newFileName = `${nameWithoutExt}_${Date.now()}${extension}`;
                targetPath = path.join(targetDir, newFileName);
            }

            try {
                fs.moveSync(fullPath, targetPath);

                // 计算新的相对路径
                const relativePath = path.relative(hexo.source_dir, targetPath).replace(/\\/g, '/');

                return res.done({
                    success: true,
                    newPath: `/${relativePath}`,
                    url: `${hexo.config.url}/${relativePath}`,
                    name: path.basename(targetPath)
                });
            } catch (err) {
                console.error('移动图片失败:', err);
                return res.send(500, '移动图片失败: ' + err.message);
            }
        }

        // 远程对象存储移动（拷贝 + 删除）
        try {
            const srcKey = imagePath.replace(/^\/+/, '');
            const fileName = path.basename(srcKey);
            const dstKey = targetFolder ? `${targetFolder}/${fileName}` : fileName;

            const finalKey = await moveRemoteObject(type, srcKey, dstKey, config);

            return res.done({
                success: true,
                newPath: finalKey,
                url: buildObjectUrl(type, finalKey, config),
                name: path.basename(finalKey)
            });
        } catch (err) {
            console.error('远程图床移动失败:', err);
            return res.send(500, '远程图床移动失败: ' + err.message);
        }
    });

    // === 远程文件夹与移动辅助函数 ===
    async function createRemoteFolder(type, folderName, config) {
        const placeholderKey = `${folderName}/.keep`;
        const empty = Buffer.from('');

        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            if (!region || !bucket || !accessKeyId || !accessKeySecret) throw new Error('阿里云OSS配置不完整');
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            await client.put(placeholderKey, empty);
            return;
        }

        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            if (!bucket || !accessKey || !secretKey) throw new Error('七牛云配置不完整');
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const putPolicy = new qiniuSDK.rs.PutPolicy({ scope: bucket });
            const uploadToken = putPolicy.uploadToken(mac);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) qnConfig.zone = qiniuSDK.zone[region];
            const formUploader = new qiniuSDK.form_up.FormUploader(qnConfig);

            await new Promise((resolve, reject) => {
                formUploader.put(uploadToken, placeholderKey, empty, null, function (err, respBody, respInfo) {
                    if (err) return reject(err);
                    if (respInfo.statusCode === 200) resolve(respBody);
                    else reject(new Error('七牛创建占位对象失败: ' + respInfo.statusCode));
                });
            });
            return;
        }

        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            if (!region || !bucket || !secretId || !secretKey) throw new Error('腾讯云COS配置不完整');
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });
            await new Promise((resolve, reject) => {
                cos.putObject({ Bucket: bucket, Region: region, Key: placeholderKey, Body: empty }, (err) => {
                    if (err) return reject(err);
                    resolve(null);
                });
            });
            return;
        }

        throw new Error(`${type} 未安装 SDK 或不支持`);
    }

    async function remoteObjectExists(type, key, config) {
        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            try { await client.head(key); return true; } catch (e) { return false; }
        }
        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) qnConfig.zone = qiniuSDK.zone[region];
            const bucketManager = new qiniuSDK.rs.BucketManager(mac, qnConfig);
            return await new Promise((resolve) => {
                bucketManager.stat(bucket, key, (err, _, info) => {
                    if (err) return resolve(false);
                    resolve(info && info.statusCode === 200);
                });
            });
        }
        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });
            return await new Promise((resolve) => {
                cos.headObject({ Bucket: bucket, Region: region, Key: key }, (err) => resolve(!err));
            });
        }
        return false;
    }

    async function ensureUniqueKey(type, desiredKey, config) {
        if (!(await remoteObjectExists(type, desiredKey, config))) return desiredKey;
        const ext = path.extname(desiredKey);
        const base = ext ? desiredKey.slice(0, -ext.length) : desiredKey;
        const candidate = `${base}_${Date.now()}${ext}`;
        return candidate;
    }

    async function moveRemoteObject(type, srcKey, dstKey, config) {
        const finalKey = await ensureUniqueKey(type, dstKey, config);

        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            await client.copy(finalKey, srcKey);
            await client.delete(srcKey);
            return finalKey;
        }

        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) qnConfig.zone = qiniuSDK.zone[region];
            const bucketManager = new qiniuSDK.rs.BucketManager(mac, qnConfig);

            await new Promise((resolve, reject) => {
                bucketManager.move(bucket, srcKey, bucket, finalKey, { force: true }, (err, _, info) => {
                    if (err) return reject(err);
                    if (info && (info.statusCode === 200 || info.statusCode === 614)) resolve(null);
                    else reject(new Error('七牛移动失败: ' + info.statusCode));
                });
            });
            return finalKey;
        }

        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });

            const CopySource = `${bucket}.cos.${region}.myqcloud.com/${encodeURI(srcKey)}`;
            await new Promise((resolve, reject) => {
                // cos-nodejs-sdk-v5 使用 putObjectCopy 进行拷贝
                cos.putObjectCopy({ Bucket: bucket, Region: region, Key: finalKey, CopySource }, (err) => {
                    if (err) return reject(err);
                    resolve(null);
                });
            });
            await new Promise((resolve, reject) => {
                cos.deleteObject({ Bucket: bucket, Region: region, Key: srcKey }, (err) => {
                    if (err) return reject(err);
                    resolve(null);
                });
            });
            return finalKey;
        }

        throw new Error(`${type} 未安装 SDK 或不支持`);
    }

    async function remoteDeleteObject(type, key, config) {
        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            await client.delete(key);
            return;
        }
        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) qnConfig.zone = qiniuSDK.zone[region];
            const bucketManager = new qiniuSDK.rs.BucketManager(mac, qnConfig);
            await new Promise((resolve, reject) => {
                bucketManager.delete(bucket, key, (err, respBody, respInfo) => {
                    if (err) return reject(err);
                    if (respInfo && respInfo.statusCode === 200) resolve(null);
                    else reject(new Error('七牛删除失败: ' + (respInfo && respInfo.statusCode)));
                });
            });
            return;
        }
        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });
            await new Promise((resolve, reject) => {
                cos.deleteObject({ Bucket: bucket, Region: region, Key: key }, (err) => {
                    if (err) return reject(err);
                    resolve(null);
                });
            });
            return;
        }
        throw new Error(`${type} 未安装 SDK 或不支持`);
    }

    async function remoteBatchDeleteObjects(type, keys, config) {
        if (!Array.isArray(keys) || keys.length === 0) return;
        const chunk = (arr, size) => {
            const out = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        };

        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            for (const batch of chunk(keys, 1000)) {
                await client.deleteMulti(batch, { quiet: true });
            }
            return;
        }

        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) qnConfig.zone = qiniuSDK.zone[region];
            const bucketManager = new qiniuSDK.rs.BucketManager(mac, qnConfig);
            for (const batch of chunk(keys, 1000)) {
                const ops = batch.map(k => qiniuSDK.rs.deleteOp(bucket, k));
                await new Promise((resolve, reject) => {
                    bucketManager.batch(ops, (err, respBody, respInfo) => {
                        if (err) return reject(err);
                        if (respInfo && (respInfo.statusCode === 200 || respInfo.statusCode === 298)) resolve(null);
                        else reject(new Error('七牛批量删除失败: ' + (respInfo && respInfo.statusCode)));
                    });
                });
            }
            return;
        }

        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });
            for (const batch of chunk(keys, 1000)) {
                const Objects = batch.map(k => ({ Key: k }));
                await new Promise((resolve, reject) => {
                    cos.deleteMultipleObject({ Bucket: bucket, Region: region, Objects }, (err, data) => {
                        if (err) return reject(err);
                        resolve(data);
                    });
                });
            }
            return;
        }

        throw new Error(`${type} 未安装 SDK 或不支持`);
    }

    // 阿里云OSS上传处理函数
    async function handleAliyunUpload(req, res, config) {
        try {
            const { region, bucket, accessKeyId, accessKeySecret, domain } = config.aliyun;

            if (!region || !bucket || !accessKeyId || !accessKeySecret) {
                return res.send(400, '阿里云OSS配置不完整');
            }

            const client = new aliOSS({
                region: region,
                accessKeyId: accessKeyId,
                accessKeySecret: accessKeySecret,
                bucket: bucket
            });

            let imageData, filename, folder;

            // 处理不同的上传方式
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                // 表单上传
                upload.single('data')(req, res, async function (err) {
                    if (err || !req.file) {
                        return res.send(500, '文件上传失败');
                    }

                    imageData = fs.readFileSync(req.file.path);
                    filename = req.body.filename || ensureUtf8Filename(req.file.originalname);
                    folder = req.body.folder || '';

                    await uploadToAliyun(client, imageData, filename, folder, domain, res);

                    // 清理临时文件
                    fs.unlinkSync(req.file.path);
                });
            } else {
                // Base64上传
                const { data, filename: reqFilename, folder: reqFolder } = req.body;

                if (!data) {
                    return res.send(400, '图片数据不能为空');
                }

                const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    return res.send(400, '无效的图片数据');
                }

                const type = matches[1];
                imageData = Buffer.from(matches[2], 'base64');
                filename = reqFilename || `${uuidv4()}.${type.split('/')[1]}`;
                folder = reqFolder || '';

                await uploadToAliyun(client, imageData, filename, folder, domain, res);
            }
        } catch (error) {
            console.error('阿里云OSS上传失败:', error);
            res.send(500, '阿里云OSS上传失败: ' + error.message);
        }
    }

    async function uploadToAliyun(client, imageData, filename, folder, domain, res) {
        const objectName = folder ? `${folder}/${filename}` : filename;

        try {
            const result = await client.put(objectName, imageData);
            const url = domain || result.url;

            res.done({
                code: 0,
                url: url,
                path: `/${objectName}`,
                name: filename,
                src: url
            });
        } catch (error) {
            throw error;
        }
    }

    // 七牛云上传处理函数
    async function handleQiniuUpload(req, res, config) {
        try {
            const { region, bucket, accessKey, secretKey, domain } = config.qiniu;

            if (!bucket || !accessKey || !secretKey || !domain) {
                return res.send(400, '七牛云配置不完整');
            }

            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const options = {
                scope: bucket,
            };
            const putPolicy = new qiniuSDK.rs.PutPolicy(options);
            const uploadToken = putPolicy.uploadToken(mac);

            const qiniuConfig = new qiniuSDK.conf.Config();
            qiniuConfig.zone = qiniuSDK.zone[region] || qiniuSDK.zone.Zone_z0;
            const formUploader = new qiniuSDK.form_up.FormUploader(qiniuConfig);

            let imageData, filename, folder;

            // 处理不同的上传方式
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                // 表单上传
                upload.single('data')(req, res, async function (err) {
                    if (err || !req.file) {
                        return res.send(500, '文件上传失败');
                    }

                    imageData = fs.readFileSync(req.file.path);
                    filename = req.body.filename || ensureUtf8Filename(req.file.originalname);
                    folder = req.body.folder || '';

                    await uploadToQiniu(formUploader, uploadToken, imageData, filename, folder, domain, res);

                    // 清理临时文件
                    fs.unlinkSync(req.file.path);
                });
            } else {
                // Base64上传
                const { data, filename: reqFilename, folder: reqFolder } = req.body;

                if (!data) {
                    return res.send(400, '图片数据不能为空');
                }

                const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    return res.send(400, '无效的图片数据');
                }

                const type = matches[1];
                imageData = Buffer.from(matches[2], 'base64');
                filename = reqFilename || `${uuidv4()}.${type.split('/')[1]}`;
                folder = reqFolder || '';

                await uploadToQiniu(formUploader, uploadToken, imageData, filename, folder, domain, res);
            }
        } catch (error) {
            console.error('七牛云上传失败:', error);
            res.send(500, '七牛云上传失败: ' + error.message);
        }
    }

    function uploadToQiniu(formUploader, uploadToken, imageData, filename, folder, domain, res) {
        const objectName = folder ? `${folder}/${filename}` : filename;

        formUploader.put(uploadToken, objectName, imageData, null, function (respErr, respBody, respInfo) {
            if (respErr) {
                throw respErr;
            }

            if (respInfo.statusCode === 200) {
                const url = `${domain}/${objectName}`;
                res.done({
                    code: 0,
                    url: url,
                    path: `/${objectName}`,
                    name: filename,
                    src: url
                });
            } else {
                res.send(500, '七牛云上传失败');
            }
        });
    }

    // 腾讯云COS上传处理函数
    async function handleTencentUpload(req, res, config) {
        try {
            const { region, bucket, secretId, secretKey, domain } = config.tencent;

            if (!region || !bucket || !secretId || !secretKey) {
                return res.send(400, '腾讯云COS配置不完整');
            }

            const cos = new tencentCOS({
                SecretId: secretId,
                SecretKey: secretKey,
            });

            let imageData, filename, folder;

            // 处理不同的上传方式
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                // 表单上传
                upload.single('data')(req, res, async function (err) {
                    if (err || !req.file) {
                        return res.send(500, '文件上传失败');
                    }

                    imageData = fs.readFileSync(req.file.path);
                    filename = req.body.filename || ensureUtf8Filename(req.file.originalname);
                    folder = req.body.folder || '';

                    await uploadToTencent(cos, region, bucket, imageData, filename, folder, domain, res);

                    // 清理临时文件
                    fs.unlinkSync(req.file.path);
                });
            } else {
                // Base64上传
                const { data, filename: reqFilename, folder: reqFolder } = req.body;

                if (!data) {
                    return res.send(400, '图片数据不能为空');
                }

                const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    return res.send(400, '无效的图片数据');
                }

                const type = matches[1];
                imageData = Buffer.from(matches[2], 'base64');
                filename = reqFilename || `${uuidv4()}.${type.split('/')[1]}`;
                folder = reqFolder || '';

                await uploadToTencent(cos, region, bucket, imageData, filename, folder, domain, res);
            }
        } catch (error) {
            console.error('腾讯云COS上传失败:', error);
            res.send(500, '腾讯云COS上传失败: ' + error.message);
        }
    }

    function uploadToTencent(cos, region, bucket, imageData, filename, folder, domain, res) {
        const objectName = folder ? `${folder}/${filename}` : filename;

        cos.putObject({
            Bucket: bucket,
            Region: region,
            Key: objectName,
            Body: imageData,
        }, function (err, data) {
            if (err) {
                throw err;
            }

            const url = domain || `https://${bucket}.cos.${region}.myqcloud.com/${objectName}`;
            res.done({
                code: 0,
                url: url,
                path: `/${objectName}`,
                name: filename,
                src: url
            });
        });
    }

    // 工具函数：列举远程对象
    async function listRemoteObjects(type, config) {
        if (type === 'aliyun' && aliOSS) {
            const { region, bucket, accessKeyId, accessKeySecret } = config.aliyun || {};
            if (!region || !bucket || !accessKeyId || !accessKeySecret) return [];
            const client = new aliOSS({ region, accessKeyId, accessKeySecret, bucket });
            const objects = [];
            let continuationToken = undefined;
            do {
                const result = await client.listV2({ 'max-keys': 1000, 'continuation-token': continuationToken });
                if (result && Array.isArray(result.objects)) {
                    for (const obj of result.objects) {
                        objects.push({ key: obj.name, size: obj.size, lastModified: obj.lastModified });
                    }
                }
                continuationToken = result && result.nextContinuationToken ? result.nextContinuationToken : undefined;
            } while (continuationToken);
            return objects;
        }

        if (type === 'qiniu' && qiniuSDK) {
            const { bucket, accessKey, secretKey, region } = config.qiniu || {};
            if (!bucket || !accessKey || !secretKey) return [];
            const mac = new qiniuSDK.auth.digest.Mac(accessKey, secretKey);
            const qnConfig = new qiniuSDK.conf.Config();
            if (region && qiniuSDK.zone[region]) {
                qnConfig.zone = qiniuSDK.zone[region];
            }
            const bucketManager = new qiniuSDK.rs.BucketManager(mac, qnConfig);
            const objects = [];
            let options = { limit: 1000 };
            let marker = null;
            do {
                if (marker) options.marker = marker;
                const page = await new Promise((resolve, reject) => {
                    bucketManager.listPrefix(bucket, options, function (err, respBody, respInfo) {
                        if (err) return reject(err);
                        if (respInfo.statusCode === 200) {
                            resolve({ items: respBody.items || [], marker: respBody.marker });
                        } else {
                            reject(new Error('Qiniu list error: ' + respInfo.statusCode));
                        }
                    });
                });
                for (const item of page.items) {
                    objects.push({ key: item.key, size: item.fsize, lastModified: item.putTime ? new Date(item.putTime / 10000) : undefined });
                }
                marker = page.marker;
            } while (marker);
            return objects;
        }

        if (type === 'tencent' && tencentCOS) {
            const { region, bucket, secretId, secretKey } = config.tencent || {};
            if (!region || !bucket || !secretId || !secretKey) return [];
            const cos = new tencentCOS({ SecretId: secretId, SecretKey: secretKey });
            const objects = [];
            let continuationToken = undefined;
            do {
                const resp = await new Promise((resolve, reject) => {
                    cos.getBucket({ Bucket: bucket, Region: region, MaxKeys: 1000, ContinuationToken: continuationToken }, function (err, data) {
                        if (err) return reject(err);
                        resolve(data);
                    });
                });
                if (resp && Array.isArray(resp.Contents)) {
                    for (const item of resp.Contents) {
                        objects.push({ key: item.Key, size: item.Size, lastModified: item.LastModified });
                    }
                }
                continuationToken = (resp && resp.IsTruncated && resp.NextContinuationToken) ? resp.NextContinuationToken : undefined;
            } while (continuationToken);
            return objects;
        }

        return [];
    }

    function buildObjectUrl(type, key, config) {
        if (type === 'aliyun') {
            const { region, bucket, domain } = config.aliyun || {};
            if (domain) return `${domain.replace(/\/$/, '')}/${encodeURI(key)}`;
            if (region && bucket) return `https://${bucket}.oss-${region}.aliyuncs.com/${encodeURI(key)}`;
            return `/${encodeURI(key)}`;
        } else if (type === 'qiniu') {
            const { domain } = config.qiniu || {};
            if (domain) return `${domain.replace(/\/$/, '')}/${encodeURI(key)}`;
            return `/${encodeURI(key)}`;
        } else if (type === 'tencent') {
            const { region, bucket, domain } = config.tencent || {};
            if (domain) return `${domain.replace(/\/$/, '')}/${encodeURI(key)}`;
            if (region && bucket) return `https://${bucket}.cos.${region}.myqcloud.com/${encodeURI(key)}`;
            return `/${encodeURI(key)}`;
        }
        return `/${encodeURI(key)}`;
    }
};