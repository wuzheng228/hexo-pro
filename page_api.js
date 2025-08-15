var path = require('path')
var url = require('url')
var fs = require('hexo-fs')
var fse = require('fs-extra')
var yml = require('js-yaml')
var updateAny = require('./update'),
    update = updateAny.bind(null, 'Page')
var extend = require('extend')
const _ = require('lodash')
var hfm = require('hexo-front-matter')

const utils = require('./utils');

module.exports = function (app, hexo, use) {
    function addIsDraft(post) {
        post.isDraft = post?.source && post?.source.indexOf('_draft') === 0 || false
        post.isDiscarded = post?.source && post?.source.indexOf('_discarded') === 0 || false
        post.updated = formatDateTime(post.updated)
        post.date = formatDateTime(post.date)
        return post
    }

    function addFormatDateTime(page) {
        // page.isDiscarded = page.source && page.source.indexOf('_discarded') === 0
        page.updated = formatDateTime(page.updated)
        page.date = formatDateTime(page.date)
        return page
    }

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
    function remove(id, body, res) {
        id = utils.base64Decode(id)
        var page = hexo.model('Page').filter(p => p.permalink === id).data[0]
        if (!page) return res.send(404, "Post not found")

        // 生成唯一路径：_discarded/<timestamp>/original_path
        const timestamp = Date.now()
        const originalFilename = path.basename(page.source)
        const originalDirname = path.dirname(page.source);
        const newSource = path.join('_discarded', String(timestamp), originalDirname, originalFilename);

        // 物理移动文件
        const oldPath = path.join(hexo.source_dir, page.source)
        const newDir = path.join(hexo.source_dir, path.dirname(newSource))
        const newPath = path.join(newDir, originalFilename)

        // 使用 fse 移动文件到新路径下
        fse.ensureDir(newDir, err => {
            if (err) return res.send(500, `Failed to create directory: ${err.message}`);
            fse.move(oldPath, newPath, { overwrite: false }, err => {
                if (err) return res.send(500, `File operation failed: ${err.message}`);

                // 从数据模型中删除页面记录
                hexo.model('Page').remove({ _id: page._id }, err => {
                    if (err) return res.send(500, `Failed to remove page from model: ${err.message}`);

                    // 刷新 Hexo 数据
                    hexo.source.process().then(() => {
                        // 写入回收站记录
                        try {
                            const databaseManager = require('./database-manager');
                            if (databaseManager && databaseManager.isReady()) {
                                const { recycleDb } = databaseManager.getDatabases();
                                if (recycleDb) {
                                    recycleDb.insert({
                                        type: 'page',
                                        title: page.title,
                                        permalink: page.permalink,
                                        originalSource: page.source,
                                        discardedPath: newSource.replace(/\\/g, '/'),
                                        isDraft: false,
                                        deletedAt: new Date(),
                                    }, function () { });
                                }
                            }
                        } catch (_) { }
                        res.done(addIsDraft(page))
                    }).catch(e => {
                        console.error(e, e.stack)
                        res.send(500, 'Failed to refresh data')
                    })
                });
            });
        });
    }

    async function createPageManually(req, res) {
        if (!req.body) {
            return res.send(400, 'No page body given');
        }
        if (!req.body.title) {
            return res.send(400, 'No title given');
        }

        // 生成唯一文件名
        let title = req.body.title;
        let filePath = path.join(hexo.source_dir, `${title}/index.md`);

        // 检查文件是否存在
        const exists = fse.pathExistsSync(filePath);
        if (exists) {
            // 如果存在，自动添加时间戳后缀
            title = `${title} (${Date.now()})`;
            filePath = path.join(hexo.source_dir, `${title}/index.md`);
            // 不返回错误，而是继续创建带有新标题的页面
        }

        // 生成页面的元数据
        const frontMatter = {
            title: title,
            layout: 'page',
            date: new Date(),
            updated: new Date(),
        };

        // 将元数据转换为 YAML 格式
        const frontMatterYaml = hfm.stringify(frontMatter);

        // 页面内容，这里可以根据需要修改
        const pageContent = `${frontMatterYaml}`;

        // 创建文件并写入内容
        await fs.writeFile(filePath, pageContent, async (err) => {
            if (err) {
                console.error(err);
                return res.send(500, 'Failed to create page');
            }
        });

        // 通知 Hexo 重新处理数据源
        await hexo.source.process().then(() => {
            console.log('Page created:', filePath);
        }).catch(e => {
            console.error(e);
            res.send(500, 'Failed to refresh data');
        });

        var page = hexo.model('Page').findOne({ source: filePath.slice(hexo.source_dir.length).replace(/\\/g, '/') });

        // 如果存在重名情况，在返回结果中添加提示信息
        if (exists) {
            page.titleChanged = true; // 添加标志，前端可以据此显示提示
            page.originalTitle = req.body.title; // 保存原始标题
        }

        return res.done(addFormatDateTime(page));
    }

    // 检查页面是否存在
    use('pages/check-exists', function (req, res, next) {
        if (req.method !== 'GET') return next();

        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { path: pagePath } = queryParams;  // 将参数名改为 pagePath

        if (!pagePath) {
            return res.send(400, 'No path provided');
        }

        const filePath = path.join(hexo.source_dir, pagePath);
        const exists = fse.pathExistsSync(filePath);

        return res.done({ exists });
    });

    use('pages/list', function (req, res) {
        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { deleted, page = 1, pageSize = 12 } = queryParams;

        var pageModel = hexo.model('Page');
        let pages = pageModel.toArray()
            .map(page => {
                const { site, raw, content, _content, more, ...rest } = page;
                return rest;
            })
            .map(addIsDraft);

        if (deleted == 'false') {
            pages = pages.filter(page => page.isDiscarded == false);
        }

        // 排序逻辑
        var sortedList = pages.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        // 分页处理
        const total = sortedList.length;
        const startIndex = (Math.max(parseInt(page), 1) - 1) * parseInt(pageSize);
        const endIndex = startIndex + parseInt(pageSize);
        const paginatedData = sortedList.slice(startIndex, endIndex);

        res.done({
            total: total,
            data: paginatedData
        });
    });

    use('pages/new', function (req, res, next) {
        if (req.method !== 'POST') return next();
        createPageManually(req, res);
    });

    use('pages/:id', function (req, res, next) {
        var id = req.params.id
        if (id === 'pages' || !id) return next()
        if (req.method === 'GET') {
            id = utils.base64Decode(id)
            var page = hexo.model('Page').filter(p => p.permalink === id)
            if (!page) return next()
            page = page.data[0]
            return res.done(addIsDraft(page))
        }

        if (!req.body) {
            return res.send(400, 'No page body given');
        }

        id = req.body._id

        update(id, req.body.update, function (err, page) {
            if (err) {
                return res.send(400, err);
            }
            res.done({
                page: addIsDraft(page)
            })
        }, hexo);
    });

    use('pages/:id/:action', function (req, res, next) {
        const id = req.params.id
        const action = req.params.action

        if (action === 'remove') {
            return remove(id, req.body, res)
        }
        if (action === 'rename') {
            return rename(id, req.body, res)
        }
    });

    use('page/update', function (req, res, next) {

        if (!req.body) {
            return res.send(400, 'No page body given');
        }

        id = req.body._id

        update(id, req.body.update, function (err, page) {
            if (err) {
                return res.send(400, err);
            }
            res.done({
                page: addIsDraft(page)
            })
        }, hexo);
    });

    use('pageMeta/:id', function (req, res, next) {
        var id = req.params.id
        if (req.method === 'GET') {
            id = utils.base64Decode(id)
            var post = hexo.model('Page').filter(p => p.permalink === id).data[0]
            if (!post) next()
            var split = hfm.split(post.raw)
            var parsed = hfm.parse([split.data, '---'].join('\n'))
            const { title, author, date, _content, ...rest } = parsed
            if (typeof rest['categories'] === 'string') {
                rest['categories'] = [rest['categories']]
            }
            if (typeof rest['tags'] === 'string') {
                rest['tags'] = [rest['tags']]
            }
            if (!rest.tags) {
                rest.tags = []
            }
            if (!rest.categories) {
                rest.categories = []
            }
            const ans = {}
            ans.categories = rest.categories
            ans.tags = rest.tags
            const fm = {}
            Object.keys(rest).forEach((name) => {
                if (name == 'categories' || name == 'tags') {
                    return
                }
                fm[name] = rest[name]
            })
            ans.frontMatter = fm
            ans.source = post.source
            return res.done(ans)
        }
    })

    use('updatePageFrontMatter', function (req, res, next) {
        if (req.method !== 'POST') return next();
        if (!req.body) {
            return res.send(500, 'No post body given');
        }
        if (!req.body.permalink) {
            return res.send(500, 'No permalink given');
        }
        if (!req.body.key || !req.body.value) {
            return res.send(500, 'Key or value missing');
        }

        const permalink = req.body.permalink;
        const key = req.body.key;
        const value = req.body.value;

        // 构建更新对象
        const frontMatterUpdate = {};
        frontMatterUpdate[key] = value;

        // 使用update函数更新文章
        update(permalink, { frontMatter: frontMatterUpdate }, async function (err, post) {
            if (err) {
                return res.send(400, err);
            }
            post = _.cloneDeep(post);

            // 如果是更新标题，则尝试同步重命名页面文件夹（<title>/index.md）
            if (key === 'title' && typeof value === 'string' && value.trim()) {
                try {
                    const oldAbs = path.join(hexo.source_dir, post.source);
                    const oldDir = path.dirname(oldAbs);
                    const parentDir = path.dirname(oldDir);
                    const newDirName = value.trim();
                    let targetDirAbs = path.join(parentDir, newDirName);
                    if (fse.pathExistsSync(targetDirAbs)) {
                        // 若已存在同名目录，添加时间戳避免冲突
                        targetDirAbs = path.join(parentDir, `${newDirName} (${Date.now()})`);
                    }
                    // 重命名目录以保留目录内资源
                    fse.moveSync(oldDir, targetDirAbs, { overwrite: false });
                    // 让 Hexo 重新处理
                    await hexo.source.process();
                    // 从模型中读取最新页面数据
                    const rel = path.relative(hexo.source_dir, path.join(targetDirAbs, path.basename(oldAbs))).replace(/\\/g, '/');
                    const updatedPage = hexo.model('Page').findOne({ source: rel });
                    if (updatedPage) {
                        return res.done(addIsDraft(updatedPage));
                    }
                } catch (e) {
                    // 如果目录重命名失败，不影响标题更新
                    console.warn('[Pages API] 重命名页面目录失败:', e && e.message);
                }
            }

            res.done(addIsDraft(post));
        }, hexo);
    });

}