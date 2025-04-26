const path = require('path')
const fs = require('hexo-fs')
const fse = require('fs-extra');
const _ = require('lodash')
const axios = require('axios'); // 需要安装axios

module.exports = function (app, hexo, use) {
    // 获取文章统计数据
    use('dashboard/posts/stats', function (req, res) {
        try {
            const posts = hexo.model('Post').toArray()
            const total = posts.length
            const drafts = posts.filter(post => post.source && post.source.indexOf('_draft') === 0).length
            const published = total - drafts

            res.done({
                total: total,
                drafts: drafts,
                published: published
            })
        } catch (error) {
            console.error('获取文章统计失败:', error)
            res.send(500, '获取文章统计失败')
        }
    })

    // 获取分类统计
    use('dashboard/categories/list', function (req, res) {
        try {
            const categories = []
            hexo.model('Category').forEach(function (category) {
                categories.push({
                    name: category.name,
                    count: category.posts.length,
                    path: category.path
                })
            })

            // 按文章数量排序
            const sortedCategories = _.sortBy(categories, 'count').reverse()
            res.done(sortedCategories)
        } catch (error) {
            console.error('获取分类统计失败:', error)
            res.send(500, '获取分类统计失败')
        }
    })

    // 获取标签统计
    use('dashboard/tags/list', function (req, res) {
        try {
            const tags = []
            hexo.model('Tag').forEach(function (tag) {
                tags.push({
                    name: tag.name,
                    count: tag.posts.length,
                    path: tag.path
                })
            })

            // 按文章数量排序
            const sortedTags = _.sortBy(tags, 'count').reverse()
            res.done(sortedTags)
        } catch (error) {
            console.error('获取标签统计失败:', error)
            res.send(500, '获取标签统计失败')
        }
    })

    // 获取最近文章
    use('dashboard/posts/recent', function (req, res) {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost')
            const limit = parseInt(parsedUrl.searchParams.get('limit')) || 5

            const posts = hexo.model('Post').toArray()

            // 按日期排序，最新的在前
            const sortedPosts = _.sortBy(posts, post => -new Date(post.date))

            // 限制返回数量
            const recentPosts = sortedPosts.slice(0, limit).map(post => {
                // 添加isDraft属性
                const isDraft = post.source && post.source.indexOf('_draft') === 0

                // 只返回需要的字段，并格式化日期
                return {
                    title: post.title,
                    permalink: post.permalink,
                    date: formatDateTime(post.date),
                    isDraft: isDraft
                }
            })

            res.done(recentPosts)
        } catch (error) {
            console.error('获取最近文章失败:', error)
            res.send(500, '获取最近文章失败')
        }
    })

    // 获取系统信息
    use('dashboard/system/info', function (req, res) {
        try {
            // 读取package.json获取Hexo版本
            const packagePath = path.join(hexo.base_dir, 'node_modules/hexo/package.json')
            let hexoVersion = 'Unknown'
            if (fs.existsSync(packagePath)) {
                const packageInfo = JSON.parse(fs.readFileSync(packagePath))
                hexoVersion = packageInfo.version
            }

            // 获取当前主题
            const theme = hexo.config.theme || 'Unknown'
            
            // 获取作者信息
            const author = hexo.config.author || ''

            // 获取插件列表
            const plugins = []
            const pluginsDir = path.join(hexo.base_dir, 'node_modules')
            if (fs.existsSync(pluginsDir)) {
                const dirs = fs.readdirSync(pluginsDir)
                dirs.forEach(dir => {
                    if (dir.startsWith('hexo-')) {
                        const pluginPackagePath = path.join(pluginsDir, dir, 'package.json')
                        if (fs.existsSync(pluginPackagePath)) {
                            try {
                                const pluginInfo = JSON.parse(fse.readFileSync(pluginPackagePath))
                                plugins.push({
                                    name: pluginInfo.name,
                                    version: pluginInfo.version,
                                    enabled: true // 默认为启用状态
                                })
                            } catch (e) {
                                console.error(`读取插件${dir}信息失败:`, e)
                            }
                        }
                    }
                })
            }

            // 获取最近部署时间（这里使用一个模拟值，实际应该从部署记录中获取）
            const deployLogPath = path.join(hexo.base_dir, '.deploy_git/.git/logs/HEAD')
            let lastDeployTime = '未知'
            if (fs.existsSync(deployLogPath)) {
                try {
                    const logs = fse.readFileSync(deployLogPath, 'utf-8')
                    const lines = logs.split('\n')
                    if (lines.length > 0) {
                        const lastLine = lines[lines.length - 2] // 最后一行通常是空行，所以取倒数第二行
                        if (lastLine) {
                            const match = lastLine.match(/>\s(\d+)\s/)
                            if (match && match[1]) {
                                const timestamp = parseInt(match[1])
                                lastDeployTime = formatDateTime(new Date(timestamp * 1000))
                            }
                        }
                    }
                } catch (e) {
                    console.error('读取部署日志失败:', e)
                }
            }

            res.done({
                hexoVersion: hexoVersion,
                theme: theme,
                plugins: plugins,
                lastDeployTime: lastDeployTime,
                author: author
            })
        } catch (error) {
            console.error('获取系统信息失败:', error)
            res.send(500, '获取系统信息失败')
        }
    })

    // 获取待办事项列表
    use('dashboard/todos/list', function (req, res) {
        try {
            const todosPath = path.join(hexo.base_dir, 'todos.json')
            let todos = []

            if (fs.existsSync(todosPath)) {
                try {
                    todos = JSON.parse(fse.readFileSync(todosPath))
                } catch (e) {
                    console.error('解析待办事项文件失败:', e)
                }
            }

            res.done(todos)
        } catch (error) {
            console.error('获取待办事项失败:', error)
            res.send(500, '获取待办事项失败')
        }
    })

    // 添加待办事项
    use('dashboard/todos/add', function (req, res, next) {
        if (req.method !== 'POST') return next()

        try {
            if (!req.body || !req.body.content) {
                return res.send(400, '缺少待办事项内容')
            }

            const todosPath = path.join(hexo.base_dir, 'todos.json')
            let todos = []

            if (fs.existsSync(todosPath)) {
                try {
                    todos = JSON.parse(fse.readFileSync(todosPath))
                } catch (e) {
                    console.error('解析待办事项文件失败:', e)
                }
            }

            // 添加新待办事项
            const newTodo = {
                id: Date.now().toString(),
                content: req.body.content,
                completed: false,
                createdAt: formatDateTime(new Date())
            }

            todos.push(newTodo)

            // 保存到文件
            fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2))

            res.done(newTodo)
        } catch (error) {
            console.error('添加待办事项失败:', error)
            res.send(500, '添加待办事项失败')
        }
    })

    // 辅助函数：格式化日期时间
    function formatDateTime(dateString) {
        const date = new Date(dateString)

        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    // 获取网站访问统计数据
    use('dashboard/visit/stats', async function (req, res) {
        try {
            // 获取主题配置
            const themeConfig = hexo.theme.config || {};
            const siteUrl = hexo.config.url || '';
            
            // 检查是否启用了busuanzi统计
            const busuanziEnabled = themeConfig.busuanzi && themeConfig.busuanzi.enable;
            
            if (busuanziEnabled) {
                try {
                    // 尝试从博客首页获取busuanzi统计数据
                    const response = await axios.get(siteUrl, { timeout: 5000 });
                    const html = response.data;
                    
                    // 解析HTML获取统计数据
                    const siteUvMatch = html.match(/id="busuanzi_value_site_uv">(\d+)<\/span>/);
                    const sitePvMatch = html.match(/id="busuanzi_value_site_pv">(\d+)<\/span>/);
                    
                    const siteUv = siteUvMatch ? parseInt(siteUvMatch[1]) : 0;
                    const sitePv = sitePvMatch ? parseInt(sitePvMatch[1]) : 0;
                    
                    // 获取历史访问数据（如果有存储的话）
                    const visitStatsPath = path.join(hexo.base_dir, 'visit_stats.json');
                    let visitHistory = [];
                    
                    if (fs.existsSync(visitStatsPath)) {
                        try {
                            visitHistory = JSON.parse(fse.readFileSync(visitStatsPath));
                        } catch (e) {
                            console.error('解析访问统计历史数据失败:', e);
                        }
                    }
                    
                    // 返回数据
                    res.done({
                        success: true,
                        busuanziEnabled: true,
                        currentStats: {
                            siteUv: siteUv,
                            sitePv: sitePv
                        },
                        visitHistory: visitHistory
                    });
                } catch (error) {
                    // 如果获取失败，返回错误信息
                    console.error('获取busuanzi统计数据失败:', error);
                    res.done({
                        success: false,
                        busuanziEnabled: true,
                        error: '获取统计数据失败',
                        visitHistory: []
                    });
                }
            } else {
                // 如果未启用busuanzi，返回相应信息
                res.done({
                    success: false,
                    busuanziEnabled: false,
                    message: '未启用busuanzi统计',
                    visitHistory: []
                });
            }
        } catch (error) {
            console.error('获取访问统计失败:', error);
            res.send(500, '获取访问统计失败');
        }
    });
}