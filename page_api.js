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

const { ensureDocumentId, findDocument, parseRaw, moveDocumentIdentity, assignNewDocumentId } = require('./document_identity');
const { withRevision, readDocument, sendDocumentError, resolveSource, atomicWrite, validateFilename } = require('./document_write');

module.exports = function (app, hexo, use) {
    function addIsDraft(post) {
        post = { ...post }
        post.documentId = ensureDocumentId(hexo, post)
        post.isDraft = post?.source && post?.source.indexOf('_draft') === 0 || false
        post.isDiscarded = post?.source && post?.source.indexOf('_discarded') === 0 || false
        post.updated = formatDateTime(post.updated)
        post.date = formatDateTime(post.date)
        return post
    }

    function addFormatDateTime(page) {
        page = { ...page }
        page.documentId = ensureDocumentId(hexo, page)
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
        var page = findDocument(hexo, 'Page', id)
        if (!page) return res.send(404, "Page not found")
        const documentId = ensureDocumentId(hexo, page)

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

                try { moveDocumentIdentity(hexo, 'Page', page.source, newSource, documentId); }
                catch (error) { return res.send(error.statusCode || 500, error.message); }
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
                                        documentId,
                                        originalSource: page.source,
                                        discardedPath: newSource.replace(/\\/g, '/'),
                                        isDraft: false,
                                        deletedAt: new Date(),
                                    }, function () { });
                                }
                            }
                        } catch (_) { }
                        res.done(addIsDraft({ ...page, source: newSource }))
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

        const requestedTitle = String(req.body.title || '').trim();
        if (!requestedTitle) {
            return res.send(400, 'No title given');
        }

        try {
            // 循环生成唯一文件名，避免重试时时间戳冲突导致创建失败
            validateFilename(requestedTitle);
            let title = requestedTitle;
            let filePath = resolveSource(hexo, `${title}/index.md`);
            let attempt = 0;

            while (fse.pathExistsSync(filePath)) {
                const suffix = `${Date.now()}${attempt ? `-${attempt}` : ''}`;
                title = `${requestedTitle}${suffix}`;
                filePath = resolveSource(hexo, `${title}/index.md`);
                attempt += 1;
                if (attempt > 1000) {
                    throw new Error('Failed to generate unique page filename');
                }
            }

            const frontMatter = {
                title: title,
                layout: 'page',
                date: new Date(),
                updated: new Date(),
            };
            const pageContent = hfm.stringify(frontMatter);

            // 使用 Promise 风格，避免 callback + await 混用导致请求悬挂
            atomicWrite(hexo, `${title}/index.md`, pageContent, { exclusive: true });

            const source = filePath.slice(hexo.source_dir.length).replace(/\\/g, '/');
            await hexo.source.process([source]);

            let page = hexo.model('Page').findOne({ source });
            if (!page) {
                page = hexo.model('Page').findOne({ title });
            }
            if (!page) {
                return res.send(500, 'Page created but failed to index');
            }

            if (title !== requestedTitle) {
                page.titleChanged = true;
                page.originalTitle = requestedTitle;
            }

            assignNewDocumentId(hexo, 'Page', page);
            return res.done(addFormatDateTime(page));
        } catch (e) {
            if (!e.statusCode || e.statusCode >= 500) console.error(e);
            return sendDocumentError(res, e, 500);
        }
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
            return readDocument(hexo, 'Page', id).then(page => res.done(addIsDraft(page)), error => sendDocumentError(res, error))
        }

        if (!req.body) {
            return res.send(400, 'No page body given');
        }

        id = req.body.documentId || req.body._id

        update(id, { ...req.body.update, ...(req.body.baseRevision !== undefined ? { baseRevision: req.body.baseRevision } : {}) }, function (err, page) {
            if (err) {
                return sendDocumentError(res, err);
            }
            res.done({
                page: addIsDraft(page),
                revision: page.revision
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
            return update(id, { source: req.body?.source, ...(req.body?.baseRevision !== undefined ? { baseRevision: req.body.baseRevision } : {}) },
                (error, page) => error ? sendDocumentError(res, error) : res.done(addIsDraft(page)), hexo)
        }
    });

    use('page/update', function (req, res, next) {

        if (!req.body) {
            return res.send(400, 'No page body given');
        }

        const id = req.body.documentId || req.body._id

        update(id, { ...req.body.update, ...(req.body.baseRevision !== undefined ? { baseRevision: req.body.baseRevision } : {}) }, function (err, page) {
            if (err) {
                return sendDocumentError(res, err);
            }
            res.done({
                page: addIsDraft(page),
                revision: page.revision
            })
        }, hexo);
    });

    use('pageMeta/:id', function (req, res, next) {
        var id = req.params.id
        if (req.method === 'GET') {
            const post = findDocument(hexo, 'Page', id)
            if (!post) return res.send(404, 'Page not found')
            const parsed = parseRaw(post.raw)
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
        if (key === 'title') { try { validateFilename(value); } catch (error) { return sendDocumentError(res, error); } }

        // 构建更新对象
        const frontMatterUpdate = {};
        frontMatterUpdate[key] = value;

        // 使用update函数更新文章
        update(permalink, { frontMatter: frontMatterUpdate, ...(req.body.baseRevision !== undefined ? { baseRevision: req.body.baseRevision } : {}) }, async function (err, post) {
            if (err) {
                return sendDocumentError(res, err);
            }
            post = _.cloneDeep(post);

            // A title edit does not move a directory outside the document write queue.
            // Explicit source renames use the regular page/update operation.
            res.done(withRevision(hexo, addIsDraft(post)));
        }, hexo);
    });

}
