const path = require('path');
const fs = require('hexo-fs');
const fse = require('fs-extra');
const { exec, spawn } = require('child_process');
const utils = require('./utils');
const yaml = require('js-yaml');
const Datastore = require('nedb');

module.exports = function (app, hexo, use) {
    // 初始化 NeDB 数据库
    const dbPath = path.join(hexo.base_dir, 'data');
    if (!fs.existsSync(dbPath)) {
        fs.mkdirsSync(dbPath);
    }

    const db = {
        deployStatus: new Datastore({
            filename: path.join(dbPath, 'deploy_status.db'),
            autoload: true
        })
    };

    // 初始化部署状态
    // 在初始化部署状态的代码块中添加
    db.deployStatus.findOne({ type: 'status' }, (err, doc) => {
        if (!doc) {
            db.deployStatus.insert({
                type: 'status',
                isDeploying: false,
                progress: 0,
                stage: 'idle',
                lastDeployTime: '',
                logs: [],
                error: null
            });
        } else if (doc.isDeploying) {
            // 如果服务重启时发现有未完成的部署，自动重置状态
            db.deployStatus.update(
                { type: 'status' },
                {
                    $set: {
                        isDeploying: false,
                        stage: 'failed',
                        error: '服务重启导致部署中断',
                        logs: [...(doc.logs || []), '服务重启导致部署中断，状态已重置']
                    }
                }
            );
        }
    });

    // 获取部署配置
    use('deploy/config', function (req, res) {
        try {
            const configPath = path.join(hexo.base_dir, 'deploy_config.json');
            let config = {
                repository: '',
                branch: 'main',
                message: 'Site updated: {{ now("YYYY-MM-DD HH:mm:ss") }}',
                token: '',
                lastDeployTime: ''
            };

            if (fs.existsSync(configPath)) {
                try {
                    const savedConfig = JSON.parse(fs.readFileSync(configPath));
                    // 不返回敏感信息如 token
                    config = {
                        ...savedConfig,
                        token: savedConfig.token ? '******' : ''
                    };
                } catch (e) {
                    console.error('解析部署配置文件失败:', e);
                }
            }

            res.done(config);
        } catch (error) {
            console.error('获取部署配置失败:', error);
            res.send(500, '获取部署配置失败');
        }
    });

    // 保存部署配置
    use('deploy/save-config', function (req, res, next) {
        if (req.method !== 'POST') return next();

        try {
            if (!req.body) {
                return res.send(400, '缺少配置信息');
            }

            const configPath = path.join(hexo.base_dir, 'deploy_config.json');
            let existingConfig = {};

            if (fs.existsSync(configPath)) {
                try {
                    existingConfig = JSON.parse(fs.readFileSync(configPath));
                } catch (e) {
                    console.error('解析现有部署配置文件失败:', e);
                }
            }

            // 合并配置，保留现有 token（如果新配置中没有提供）
            const newConfig = {
                ...existingConfig,
                ...req.body,
                // 如果新配置中的 token 是占位符，则保留原来的 token
                token: req.body.token === '******' ? existingConfig.token : req.body.token
            };

            // 保存到文件
            fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

            // 更新 _config.yml 文件中的 deploy 配置
            updateHexoConfig(hexo.base_dir, newConfig);

            // 返回配置（隐藏 token）
            const safeConfig = {
                ...newConfig,
                token: newConfig.token ? '******' : ''
            };

            res.done(safeConfig);
        } catch (error) {
            console.error('保存部署配置失败:', error);
            res.send(500, '保存部署配置失败');
        }
    });

    // 执行部署 - 改为异步方式
    use('deploy/execute', function (req, res, next) {
        if (req.method !== 'POST') return next();

        try {
            // 检查是否正在部署
            db.deployStatus.findOne({ type: 'status' }, (err, status) => {
                if (err) {
                    return res.send(500, '获取部署状态失败');
                }

                if (status && status.isDeploying) {
                    return res.send(400, '部署正在进行中，请等待完成');
                }

                const configPath = path.join(hexo.base_dir, 'deploy_config.json');
                if (!fs.existsSync(configPath)) {
                    return res.send(400, '部署配置不存在，请先保存配置');
                }

                let config;
                try {
                    config = JSON.parse(fs.readFileSync(configPath));
                } catch (e) {
                    console.error('解析部署配置文件失败:', e);
                    return res.send(500, '解析部署配置失败');
                }

                if (!config.repository) {
                    return res.send(400, '缺少仓库地址');
                }

                // 更新部署状态为进行中
                db.deployStatus.update(
                    { type: 'status' },
                    {
                        $set: {
                            isDeploying: true,
                            progress: 0,
                            stage: 'started',
                            logs: ['开始部署过程...'],
                            error: null
                        }
                    },
                    {},
                    (err) => {
                        if (err) {
                            console.error('更新部署状态失败:', err);
                            return res.send(500, '更新部署状态失败');
                        }

                        // 立即返回响应，不等待部署完成
                        res.done({
                            success: true,
                            message: '部署已开始，请通过状态 API 查询进度',
                            isDeploying: true
                        });

                        // 异步执行部署
                        executeDeployAsync(hexo.base_dir, db, config);
                    }
                );
            });
        } catch (error) {
            console.error('执行部署失败:', error);
            res.send(500, `执行部署失败: ${error.message}`);
        }
    });

    // 检查部署状态 - 增强版
    use('deploy/status', function (req, res) {
        try {
            db.deployStatus.findOne({ type: 'status' }, (err, status) => {
                if (err) {
                    return res.send(500, '获取部署状态失败');
                }

                if (!status) {
                    return res.done({
                        isDeploying: false,
                        progress: 0,
                        stage: 'idle',
                        lastDeployTime: '未知',
                        logs: [],
                        hasDeployGit: fs.existsSync(path.join(hexo.base_dir, '.deploy_git'))
                    });
                }

                // 检查 .deploy_git 目录是否存在
                const hasDeployGit = fs.existsSync(path.join(hexo.base_dir, '.deploy_git'));

                res.done({
                    ...status,
                    hasDeployGit
                });
            });
        } catch (error) {
            console.error('获取部署状态失败:', error);
            res.send(500, '获取部署状态失败');
        }
    });

    // 辅助函数：格式化日期时间
    function formatDateTime(dateString) {
        const date = new Date(dateString);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 辅助函数：更新 Hexo 配置文件中的 deploy 部分
    function updateHexoConfig(baseDir, deployConfig) {
        try {
            const hexoConfigPath = path.join(baseDir, '_config.yml');

            // 读取现有配置
            let hexoConfigContent = fse.readFileSync(hexoConfigPath, 'utf-8');
            let hexoConfig;

            try {
                hexoConfig = yaml.load(hexoConfigContent);
            } catch (e) {
                console.error('解析 Hexo 配置文件失败:', e);
                throw new Error('解析 Hexo 配置文件失败');
            }

            // 构建新的 deploy 配置
            const repoUrl = deployConfig.token
                ? `https://${deployConfig.token}@github.com/${deployConfig.repository}.git`
                : `https://github.com/${deployConfig.repository}.git`;

            // 更新 deploy 配置
            hexoConfig.deploy = {
                type: 'git',
                repo: repoUrl,
                branch: deployConfig.branch,
                message: deployConfig.message
            };

            // 将配置写回文件
            const newConfigContent = yaml.dump(hexoConfig);
            fs.writeFileSync(hexoConfigPath, newConfigContent, 'utf-8');

            console.log('已更新 _config.yml 中的部署配置');
        } catch (error) {
            console.error('更新 Hexo 配置文件失败:', error);
            throw error;
        }
    }

    // 辅助函数：异步执行部署过程
    function executeDeployAsync(baseDir, db, config) {
        const updateStatus = (update) => {
            return new Promise((resolve, reject) => {
                db.deployStatus.update(
                    { type: 'status' },
                    { $set: update },
                    {},
                    (err) => {
                        if (err) {
                            console.error('更新部署状态失败:', err);
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            });
        };

        const addLog = (message) => {
            console.log(message);
            db.deployStatus.findOne({ type: 'status' }, (err, status) => {
                if (!err && status) {
                    const logs = [...status.logs, message];
                    db.deployStatus.update(
                        { type: 'status' },
                        { $set: { logs: logs } },
                        {}
                    );
                }
            });
        };

        const runCommand = (command, args, options) => {
            return new Promise((resolve, reject) => {
                // 使用 npx 调用 hexo 命令
                let finalCommand, finalArgs;
                const mergedOptions = { 
                    ...options,
                    shell: true,  // 在 Windows 上使用 shell 模式
                    windowsVerbatimArguments: false  // 禁用逐字参数处理
                };

                if (command === 'hexo') {
                    if (process.platform === 'win32') {
                        finalCommand = 'npx';
                        finalArgs = ['hexo', ...args];
                    } else {
                        finalCommand = 'npx';
                        finalArgs = ['hexo', ...args];
                    }
                } else {
                    finalCommand = command;
                    finalArgs = args;
                }

                addLog(`执行命令: ${finalCommand} ${finalArgs.join(' ')}`);
                const proc = spawn(finalCommand, finalArgs, mergedOptions);

                proc.stdout.on('data', (data) => {
                    addLog(data.toString().trim());
                });

                proc.stderr.on('data', (data) => {
                    const message = data.toString().trim();
                    // 过滤掉调试器相关的信息
                    if (message.includes('Waiting for the debugger to disconnect')) {
                        // 这是正常的调试信息，不作为错误处理
                        addLog(message);
                    } else {
                        addLog(`错误: ${message}`);
                    }
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`命令执行失败，退出码: ${code}`));
                    }
                });

                proc.on('error', (err) => {
                    addLog(`进程错误: ${err.message}`);
                    reject(err);
                });
            });
        };

        // 开始部署流程
        (async () => {
            try {
                // 清理
                await updateStatus({ stage: 'cleaning', progress: 10 });
                addLog('执行清理...');
                await runCommand('hexo', ['clean'], { cwd: baseDir });

                // 生成
                await updateStatus({ stage: 'generating', progress: 30 });
                addLog('生成静态文件...');
                await runCommand('hexo', ['generate'], { cwd: baseDir });

                // 部署
                await updateStatus({ stage: 'deploying', progress: 60 });
                addLog('部署到 GitHub...');
                await runCommand('hexo', ['deploy'], { cwd: baseDir });

                // 完成
                const now = new Date();
                const formattedTime = formatDateTime(now);

                // 更新配置文件中的最后部署时间
                config.lastDeployTime = now.toISOString();
                fs.writeFileSync(
                    path.join(baseDir, 'deploy_config.json'),
                    JSON.stringify(config, null, 2)
                );

                await updateStatus({
                    isDeploying: false,
                    progress: 100,
                    stage: 'completed',
                    lastDeployTime: formattedTime
                });

                addLog('部署成功完成！');
            } catch (error) {
                console.error('部署过程出错:', error);
                await updateStatus({
                    isDeploying: false,
                    stage: 'failed',
                    error: error.message
                });
                addLog(`部署失败: ${error.message}`);
            }
        })();
    }

    // 重置部署状态
    use('deploy/reset-status', function (req, res, next) {
        if (req.method !== 'POST') return next();

        try {
            db.deployStatus.update(
                { type: 'status' },
                {
                    $set: {
                        isDeploying: false,
                        progress: 0,
                        stage: 'idle',
                        error: null,
                        logs: ['部署状态已重置']
                    }
                },
                {},
                (err) => {
                    if (err) {
                        console.error('重置部署状态失败:', err);
                        return res.send(500, '重置部署状态失败');
                    }

                    res.done({
                        success: true,
                        message: '部署状态已重置'
                    });
                }
            );
        } catch (error) {
            console.error('重置部署状态失败:', error);
            res.send(500, `重置部署状态失败: ${error.message}`);
        }
    });
};