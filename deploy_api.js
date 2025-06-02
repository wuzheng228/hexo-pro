const path = require('path');
const fs = require('hexo-fs');
const fse = require('fs-extra');
const { exec, spawn } = require('child_process');
const utils = require('./utils');
const yaml = require('js-yaml');

module.exports = function (app, hexo, use, db) {
    // 使用传入的统一数据库实例，而不是创建自己的
    if (!db || !db.deployStatusDb) {
        throw new Error('[Hexo Pro]: 部署API需要数据库实例');
    }

    const deployStatusDb = db.deployStatusDb;

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
            deployStatusDb.findOne({ type: 'status' }, (err, status) => {
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
                deployStatusDb.update(
                    { type: 'status' },
                    {
                        $set: {
                            isDeploying: true,
                            progress: 0,
                            stage: 'started',
                            logs: ['deploy.started'],
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
                        executeDeployAsync(hexo.base_dir, deployStatusDb, config);
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
            deployStatusDb.findOne({ type: 'status' }, (err, status) => {
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

    // 辅助函数：处理提交消息模板
    function processCommitMessage(message) {
        // 替换 {{ now("YYYY-MM-DD HH:mm:ss") }} 格式
        return message.replace(/\{\{\s*now\(["']([^"']+)["']\)\s*\}\}/g, (match, format) => {
            const now = new Date();
            // 简单的日期格式化
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            return format
                .replace('YYYY', year)
                .replace('MM', month)
                .replace('DD', day)
                .replace('HH', hours)
                .replace('mm', minutes)
                .replace('ss', seconds);
        });
    }

    // 辅助函数：异步执行部署过程
    function executeDeployAsync(baseDir, deployStatusDb, config) {
        const updateStatus = (update) => {
            return new Promise((resolve, reject) => {
                deployStatusDb.update(
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
            deployStatusDb.findOne({ type: 'status' }, (err, status) => {
                if (!err && status) {
                    const logs = [...status.logs, message];
                    deployStatusDb.update(
                        { type: 'status' },
                        { $set: { logs: logs } },
                        {}
                    );
                }
            });
        };

        const runCommand = (command, args, options) => {
            return new Promise((resolve, reject) => {
                let finalCommand = command;
                let finalArgs = args;
                let mergedOptions = { 
                    ...options,
                    shell: true,
                    windowsVerbatimArguments: false
                };

                // 对于 git commit 命令，使用特殊处理避免 shell 解析问题
                if (command === 'git' && args[0] === 'commit' && args.includes('-m')) {
                    const messageIndex = args.indexOf('-m') + 1;
                    if (messageIndex < args.length) {
                        // 创建新的参数数组，确保提交消息被正确引用
                        finalArgs = [...args];
                        finalArgs[messageIndex] = `"${args[messageIndex]}"`;
                    }
                }

                addLog(`run command: ${finalCommand} ${finalArgs.join(' ')}`);
                const proc = spawn(finalCommand, finalArgs, mergedOptions);

                proc.stdout.on('data', (data) => {
                    addLog(data.toString().trim());
                });

                proc.stderr.on('data', (data) => {
                    const message = data.toString().trim();
                    if (message.includes('Waiting for the debugger to disconnect')) {
                        addLog(message);
                    } else {
                        addLog(`error: ${message}`);
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
                    addLog(`Process error: ${err.message}`);
                    reject(err);
                });
            });
        };

        // 自定义 Git 部署函数
        const customGitDeploy = async (baseDir, config) => {
            const deployDir = path.join(baseDir, '.deploy_git');
            const publicDir = path.join(baseDir, 'public');
            
            // 构建仓库URL
            const repoUrl = config.token
                ? `https://${config.token}@github.com/${config.repository}.git`
                : `https://github.com/${config.repository}.git`;

            // 处理提交消息
            const commitMessage = processCommitMessage(config.message || 'Site updated');

            addLog('deploy.git.preparing');

            // 检查 public 目录是否存在
            if (!fs.existsSync(publicDir)) {
                throw new Error('public 目录不存在，请先运行 hexo generate');
            }

            // 初始化或更新 .deploy_git 目录
            if (!fs.existsSync(deployDir)) {
                addLog('deploy.git.cloning');
                await runCommand('git', ['clone', repoUrl, '.deploy_git'], { cwd: baseDir });
            } else {
                addLog('deploy.git.updating');
                
                // 检查并设置 origin remote
                try {
                    // 检查 origin remote 是否存在
                    await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: deployDir });
                } catch (error) {
                    // origin 不存在，添加它
                    addLog('deploy.git.adding.origin');
                    await runCommand('git', ['remote', 'add', 'origin', repoUrl], { cwd: deployDir });
                }
                
                // 确保 origin URL 是正确的
                try {
                    await runCommand('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: deployDir });
                } catch (error) {
                    addLog('deploy.git.remote.set.url.failed');
                }
                
                // 切换到指定分支
                try {
                    await runCommand('git', ['checkout', config.branch || 'main'], { cwd: deployDir });
                } catch (error) {
                    // 如果分支不存在，创建新分支
                    addLog(`deploy.git.creating.branch: ${config.branch || 'main'}`);
                    await runCommand('git', ['checkout', '-b', config.branch || 'main'], { cwd: deployDir });
                }
                
                // 拉取最新更改
                try {
                    await runCommand('git', ['pull', 'origin', config.branch || 'main'], { cwd: deployDir });
                } catch (error) {
                    addLog('deploy.git.pull.failed.continuing');
                }
            }

            addLog('deploy.git.copying.files');
            
            // 清空 deploy 目录（除了 .git）
            const files = await fse.readdir(deployDir);
            for (const file of files) {
                if (file !== '.git') {
                    await fse.remove(path.join(deployDir, file));
                }
            }

            // 复制 public 目录内容到 deploy 目录
            await fse.copy(publicDir, deployDir, {
                filter: (src, dest) => {
                    // 不复制 .git 目录
                    return !src.includes('.git');
                }
            });

            addLog('deploy.git.adding.files');
            
            // Git 操作
            await runCommand('git', ['add', '.'], { cwd: deployDir });

            // 检查是否有变更
            try {
                await runCommand('git', ['diff', '--staged', '--quiet'], { cwd: deployDir });
                addLog('deploy.git.no.changes');
                return; // 没有变更，直接返回
            } catch (error) {
                // 有变更，继续提交
                addLog('deploy.git.committing');
            }

            await runCommand('git', ['commit', '-m', commitMessage], { cwd: deployDir });

            addLog('deploy.git.pushing');
            await runCommand('git', ['push', 'origin', config.branch || 'main'], { cwd: deployDir });
            
            addLog('deploy.git.success');
        };

        // 开始部署流程
        (async () => {
            try {
                // 清理
                await updateStatus({ stage: 'cleaning', progress: 10 });
                addLog('deploy.cleaning');
                await runCommand('npx', ['hexo', 'clean'], { cwd: baseDir });

                // 生成
                await updateStatus({ stage: 'generating', progress: 30 });
                addLog('deploy.generating');
                await runCommand('npx', ['hexo', 'generate'], { cwd: baseDir });

                // 自定义 Git 部署
                await updateStatus({ stage: 'deploying', progress: 60 });
                addLog('deploy.deploying');
                await customGitDeploy(baseDir, config);

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

                addLog('deploy.success');
            } catch (error) {
                console.error('部署过程出错:', error);
                await updateStatus({
                    isDeploying: false,
                    stage: 'failed',
                    error: error.message
                });
                addLog(`deploy.failed`);
                addLog(error.message);
            }
        })();
    }

    // 重置部署状态
    use('deploy/reset-status', function (req, res, next) {
        if (req.method !== 'POST') return next();

        try {
            deployStatusDb.update(
                { type: 'status' },
                {
                    $set: {
                        isDeploying: false,
                        progress: 0,
                        stage: 'idle',
                        error: null,
                        logs: ['deploy.status.reset']
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
                        message: 'deploy.status.reset'
                    });
                }
            );
        } catch (error) {
            console.error('重置部署状态失败:', error);
            res.send(500, `重置部署状态失败: ${error.message}`);
        }
    });

    // 清理部署目录
    use('deploy/cleanup', function (req, res, next) {
        if (req.method !== 'POST') return next();

        try {
            const deployDir = path.join(hexo.base_dir, '.deploy_git');
            
            if (fs.existsSync(deployDir)) {
                fse.removeSync(deployDir);
                
                // 同时重置部署状态
                deployStatusDb.update(
                    { type: 'status' },
                    {
                        $set: {
                            isDeploying: false,
                            progress: 0,
                            stage: 'idle',
                            error: null,
                            logs: ['deploy.cleanup.success']
                        }
                    },
                    {},
                    (err) => {
                        if (err) {
                            console.error('重置部署状态失败:', err);
                        }
                    }
                );

                res.done({
                    success: true,
                    message: '部署目录已清理，下次部署将重新克隆仓库'
                });
            } else {
                res.done({
                    success: true,
                    message: '部署目录不存在，无需清理'
                });
            }
        } catch (error) {
            console.error('清理部署目录失败:', error);
            res.send(500, `清理部署目录失败: ${error.message}`);
        }
    });
};