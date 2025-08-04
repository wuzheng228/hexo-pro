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

module.exports = function (app, hexo, use) {

    // 设置图床配置API
    use('images/config/set', function (req, res) {
        const { storageType, customPath, aliyunConfig, qiniuConfig, tencentConfig } = req.body;

        // 更新全局配置
        global.hexoProStorageConfig = {
            type: storageType || 'local',
            customPath: customPath || 'images',
            aliyun: aliyunConfig || {},
            qiniu: qiniuConfig || {},
            tencent: tencentConfig || {}
        };

        console.log('[Image API] 图床配置已更新:', global.hexoProStorageConfig);

        res.done({
            code: 0,
            msg: '图床配置已保存',
            data: global.hexoProStorageConfig
        });
    });

    // 获取图床配置API
    use('images/config/get', function (req, res) {
        const config = getStorageConfig();
        res.done({
            code: 0,
            data: config
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

    // 获取图片列表
    use('images/list', function (req, res) {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const folder = req.query.folder || '';

        // 获取配置中的路径
        const config = getStorageConfig();
        const imagesDir = path.join(hexo.source_dir, config.customPath);
        const targetDir = folder ? path.join(imagesDir, folder) : imagesDir;

        // 确保目录存在
        fs.ensureDirSync(targetDir);

        // 获取所有文件夹
        const folders = [];
        try {
            const items = fs.readdirSync(imagesDir);
            items.forEach(item => {
                const itemPath = path.join(imagesDir, item);
                if (fs.statSync(itemPath).isDirectory()) {
                    folders.push(item);
                }
            });
        } catch (err) {
            console.error('读取文件夹失败:', err);
        }

        // 获取当前文件夹下的所有图片
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
        } catch (err) {
            console.error('读取图片失败:', err);
        }

        // 排序和分页
        images.sort((a, b) => b.lastModified - a.lastModified);
        const total = images.length;
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedImages = images.slice(startIndex, endIndex);

        res.done({
            images: paginatedImages,
            folders: folders,
            total: total,
            page: page,
            pageSize: pageSize
        });
    });

    // 创建文件夹
    use('images/createFolder', function (req, res) {
        const folderName = req.body.folderName;
        if (!folderName) {
            return res.send(400, '文件夹名称不能为空');
        }

        // 验证文件夹名称 - 修改正则表达式以支持中文
        if (!/^[\w\u4e00-\u9fa5\-]+$/.test(folderName)) {
            return res.send(400, '文件夹名称只能包含字母、数字、下划线、短横线和中文');
        }

        // 获取配置中的路径
        const config = getStorageConfig();
        const folderPath = path.join(hexo.source_dir, config.customPath, folderName);

        try {
            if (fs.existsSync(folderPath)) {
                return res.send(400, '文件夹已存在');
            }

            fs.ensureDirSync(folderPath);
            res.done({ success: true, folderName: folderName });
        } catch (err) {
            console.error('创建文件夹失败:', err);
            res.send(500, '创建文件夹失败: ' + err.message);
        }
    });

    // 删除图片
    use('images/delete', function (req, res) {
        const imagePath = req.body.path;
        if (!imagePath) {
            return res.send(400, '图片路径不能为空');
        }

        const fullPath = path.join(hexo.source_dir, imagePath);

        try {
            if (!fs.existsSync(fullPath)) {
                return res.send(404, '图片不存在');
            }

            fs.removeSync(fullPath);
            res.done({ success: true });
        } catch (err) {
            console.error('删除图片失败:', err);
            res.send(500, '删除图片失败: ' + err.message);
        }
    });

    // 上传图片 - 修改为支持表单数据上传和第三方图床
    use('images/upload', function (req, res, next) {
        const config = getStorageConfig();

        // 根据配置的存储类型处理上传
        if (config.type === 'local') {
            handleLocalUpload(req, res, next, config);
        } else if (config.type === 'aliyun' && aliOSS) {
            handleAliyunUpload(req, res, config);
        } else if (config.type === 'qiniu' && qiniuSDK) {
            handleQiniuUpload(req, res, config);
        } else if (config.type === 'tencent' && tencentCOS) {
            handleTencentUpload(req, res, config);
        } else {
            // 如果第三方SDK未安装或配置不正确，回退到本地存储
            console.log(`[Image API] ${config.type} SDK未安装或配置不正确，回退到本地存储`);
            handleLocalUpload(req, res, next, config);
        }
    });

    // 本地存储处理函数
    function handleLocalUpload(req, res, next, config) {
        // 检查是否为表单数据上传
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            // 使用multer处理单个文件上传
            upload.single('data')(req, res, function (err) {
                if (err) {
                    console.error('文件上传失败:', err);
                    return res.send(500, '文件上传失败: ' + err.message);
                }

                if (!req.file) {
                    return res.send(400, '没有上传文件');
                }

                try {
                    // 获取文件信息
                    const file = req.file;
                    const folder = req.body.folder || '';
                    let filename = req.body.filename || path.basename(file.filename);

                    // 确定保存路径
                    const sourceImagesDir = path.join(hexo.source_dir, config.customPath);
                    const targetDir = folder
                        ? path.join(sourceImagesDir, folder)
                        : sourceImagesDir;

                    // 确保目录存在
                    fs.ensureDirSync(targetDir);

                    // 如果文件已经在临时目录，移动到目标目录
                    const finalFilePath = path.join(targetDir, filename);

                    // 检查文件是否已存在
                    if (fs.existsSync(finalFilePath)) {
                        // 如果文件已存在，添加时间戳
                        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                        const extension = filename.substring(filename.lastIndexOf('.'));
                        filename = `${nameWithoutExt}_${Date.now()}${extension}`;
                    }

                    // 移动文件到最终位置
                    fs.moveSync(file.path, path.join(targetDir, filename), { overwrite: false });

                    // 返回图片URL
                    const relativePath = folder
                        ? `${config.customPath}/${folder}/${filename}`
                        : `${config.customPath}/${filename}`;

                    res.done({
                        code: 0,
                        url: hexo.config.url + `/${relativePath}`,
                        path: `/${relativePath}`,
                        name: filename,
                        src: hexo.config.url + `/${relativePath}` // 添加src字段以兼容现有代码
                    });
                } catch (err) {
                    console.error('保存图片失败:', err);
                    res.send(500, '保存图片失败: ' + err.message);
                }
            });
        } else {
            // 处理Base64上传方式
            const data = req.body.data;
            let filename = req.body.filename || '';
            const folder = req.body.folder || '';

            if (!data) {
                return res.send(400, '图片数据不能为空');
            }

            // 处理Base64图片数据
            const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.send(400, '无效的图片数据');
            }

            const type = matches[1];
            const imageBuffer = Buffer.from(matches[2], 'base64');

            // 如果没有提供文件名，生成一个唯一的文件名
            if (!filename) {
                // 修复SVG+XML扩展名问题
                let extension = type.split('/')[1];
                // 特殊处理SVG+XML类型
                if (extension === 'svg+xml') {
                    extension = 'svg';
                }
                filename = `${uuidv4()}.${extension}`;
            } else {
                // 确保文件名有正确的扩展名
                let extension = type.split('/')[1];
                // 特殊处理SVG+XML类型
                if (extension === 'svg+xml') {
                    extension = 'svg';
                }
                if (!filename.endsWith(`.${extension}`)) {
                    filename = `${filename}.${extension}`;
                }
            }

            // 确定保存路径
            const targetDir = folder
                ? path.join(hexo.source_dir, config.customPath, folder)
                : path.join(hexo.source_dir, config.customPath);

            // 确保目录存在
            fs.ensureDirSync(targetDir);

            const filePath = path.join(targetDir, filename);

            // 检查文件是否已存在
            if (fs.existsSync(filePath)) {
                // 如果文件已存在，添加时间戳
                const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                const extension = filename.substring(filename.lastIndexOf('.'));
                filename = `${nameWithoutExt}_${Date.now()}${extension}`;
            }

            const finalFilePath = path.join(targetDir, filename);

            try {
                fs.writeFileSync(finalFilePath, imageBuffer);

                // 返回图片URL
                const relativePath = folder
                    ? `${config.customPath}/${folder}/${filename}`
                    : `${config.customPath}/${filename}`;

                res.done({
                    code: 0,
                    url: `${hexo.config.url}/${relativePath}`,
                    path: `/${relativePath}`,
                    name: filename,
                    src: `${hexo.config.url}/${relativePath}` // 添加src字段以兼容现有代码
                });
            } catch (err) {
                console.error('保存图片失败:', err);
                res.send(500, '保存图片失败: ' + err.message);
            }
        }
    }

    // 重命名图片
    use('images/rename', function (req, res) {
        const oldPath = req.body.oldPath;
        const newName = req.body.newName;

        if (!oldPath || !newName) {
            return res.send(400, '缺少必要参数');
        }

        // 验证新文件名 - 修改正则表达式以支持中文
        if (!/^[\w\u4e00-\u9fa5\-\.]+$/.test(newName)) {
            return res.send(400, '文件名只能包含字母、数字、下划线、短横线、点和中文');
        }

        const fullOldPath = path.join(hexo.source_dir, oldPath);

        if (!fs.existsSync(fullOldPath)) {
            return res.send(404, '图片不存在');
        }

        const dirName = path.dirname(fullOldPath);
        const extension = path.extname(fullOldPath);
        const newNameWithExt = newName.includes('.') ? newName : `${newName}${extension}`;
        const fullNewPath = path.join(dirName, newNameWithExt);

        if (fs.existsSync(fullNewPath)) {
            return res.send(400, '该文件名已存在');
        }

        try {
            fs.renameSync(fullOldPath, fullNewPath);

            // 计算新的相对路径
            const relativePath = path.relative(hexo.source_dir, fullNewPath).replace(/\\/g, '/');

            res.done({
                success: true,
                newPath: `/${relativePath}`,
                url: `${hexo.config.url}/${relativePath}`,
                name: newNameWithExt
            });
        } catch (err) {
            console.error('重命名图片失败:', err);
            res.send(500, '重命名图片失败: ' + err.message);
        }
    });

    // 移动图片到指定文件夹
    use('images/move', function (req, res) {
        const imagePath = req.body.path;
        const targetFolder = req.body.targetFolder || '';

        if (!imagePath) {
            return res.send(400, '图片路径不能为空');
        }

        const fullPath = path.join(hexo.source_dir, imagePath);

        if (!fs.existsSync(fullPath)) {
            return res.send(404, '图片不存在');
        }

        const fileName = path.basename(fullPath);
        const targetDir = targetFolder
            ? path.join(hexo.source_dir, 'images', targetFolder)
            : path.join(hexo.source_dir, 'images');

        // 确保目标目录存在
        fs.ensureDirSync(targetDir);

        let targetPath = path.join(targetDir, fileName);  // 改为 let 声明

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

            res.done({
                success: true,
                newPath: `/${relativePath}`,
                url: `${hexo.config.url}/${relativePath}`,
                name: path.basename(targetPath)
            });
        } catch (err) {
            console.error('移动图片失败:', err);
            res.send(500, '移动图片失败: ' + err.message);
        }
    });

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
                    filename = req.body.filename || req.file.originalname;
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
                    filename = req.body.filename || req.file.originalname;
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
                    filename = req.body.filename || req.file.originalname;
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
};