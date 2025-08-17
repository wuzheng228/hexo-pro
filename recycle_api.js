const path = require('path');
const fs = require('fs-extra');
const hfm = require('hexo-front-matter');

module.exports = function (app, hexo, use, db) {
    const recycleDb = db && db.recycleDb;

    function cleanupDiscardedEmptyDirs(startFromAbs) {
        try {
            const discardedRoot = path.resolve(hexo.source_dir, '_discarded');
            let currentDir = path.dirname(startFromAbs);
            while (currentDir.startsWith(discardedRoot)) {
                if (currentDir === discardedRoot) break;
                const files = fs.readdirSync(currentDir);
                if (files.length === 0) {
                    fs.rmdirSync(currentDir);
                    currentDir = path.dirname(currentDir);
                } else {
                    break;
                }
            }
        } catch (_) { }
    }

    function formatDateTime(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 列表
    use('recycle/list', function (req, res) {
        try {
            const parsedUrl = new URL(req.url, hexo.config.url || 'http://localhost');
            const type = parsedUrl.searchParams.get('type') || 'all';
            const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
            const pageSize = parseInt(parsedUrl.searchParams.get('pageSize') || '12', 10);
            const query = (parsedUrl.searchParams.get('query') || '').trim().toLowerCase();

            const filter = {};
            if (type !== 'all') filter.type = type;

            recycleDb.find(filter).sort({ deletedAt: -1 }).exec((err, docs) => {
                if (err) return res.send(500, '读取回收站失败');
                let items = docs || [];
                if (query) {
                    items = items.filter(it => {
                        const s = (it.title || it.originalSource || it.permalink || '').toLowerCase();
                        return s.includes(query);
                    });
                }
                const total = items.length;
                const startIndex = (Math.max(page, 1) - 1) * pageSize;
                const data = items.slice(startIndex, startIndex + pageSize);
                res.done({ total, data });
            });
        } catch (e) {
            console.error('[Recycle API] 列表失败:', e);
            return res.send(500, '列表失败: ' + e.message);
        }
    });

    // 统计
    use('recycle/stats', function (req, res) {
        try {
            recycleDb.find({}, (err, docs) => {
                if (err) return res.send(500, '统计失败');
                const total = docs.length;
                const posts = docs.filter(d => d.type === 'post').length;
                const pages = docs.filter(d => d.type === 'page').length;
                res.done({ total, posts, pages });
            });
        } catch (e) {
            console.error('[Recycle API] 统计失败:', e);
            return res.send(500, '统计失败: ' + e.message);
        }
    });

    // 还原
    use('recycle/restore', async function (req, res, next) {
        if (req.method !== 'POST') return next();
        const { id, conflictStrategy } = req.body || {};
        if (!id) return res.send(400, '缺少ID');
        try {
            recycleDb.findOne({ _id: id }, async (err, doc) => {
                if (err || !doc) return res.send(404, '未找到记录');

                const discardedAbs = path.join(hexo.source_dir, doc.discardedPath);
                const targetAbs = path.join(hexo.source_dir, doc.originalSource);
                const targetDir = path.dirname(targetAbs);
                fs.ensureDirSync(targetDir);

                const exists = fs.existsSync(targetAbs);
                let finalAbs = targetAbs;
                let shouldRenameTitle = false;
                const restoredSuffix = ` (restored ${Date.now()})`;
                const strategy = conflictStrategy || 'keepBoth';
                if (exists) {
                    if (strategy === 'overwrite') {
                        // 覆盖：文件存在则删除原文件（页面保留目录）
                        try { fs.removeSync(targetAbs); } catch (_) { }
                        finalAbs = targetAbs;
                    } else if (strategy === 'rename' || strategy === 'keepBoth') {
                        shouldRenameTitle = true;
                        if (doc.type === 'page') {
                            // 页面：重命名父目录，而不是重命名 index.md 文件
                            const originalDir = path.dirname(targetAbs);
                            const parentDir = path.dirname(originalDir);
                            const dirBase = path.basename(originalDir);
                            const renamedDir = `${dirBase}${restoredSuffix}`;
                            const newDirAbs = path.join(parentDir, renamedDir);
                            fs.ensureDirSync(newDirAbs);
                            finalAbs = path.join(newDirAbs, path.basename(targetAbs));
                        } else {
                            // 博客：重命名文件
                            const ext = path.extname(targetAbs);
                            const base = path.basename(targetAbs, ext);
                            const renamed = `${base}${restoredSuffix}${ext}`;
                            finalAbs = path.join(targetDir, renamed);
                        }
                    }
                }

                // 额外检查：当选择保留两者/重命名时，文章还原需同时考虑 _drafts 与 _posts 的同名冲突
                if (doc.type === 'post' && (strategy === 'rename' || strategy === 'keepBoth')) {
                    try {
                        const filename = path.basename(targetAbs);
                        const ext = path.extname(filename);
                        const base = path.basename(filename, ext);
                        const originalDirRel = path.dirname(doc.originalSource).replace(/\\/g, '/');
                        // 如果还原到 _drafts，则检查 _posts 中是否已有同名；反之亦然
                        if (originalDirRel.startsWith('_drafts')) {
                            const postsPath = path.join(hexo.source_dir, '_posts', filename);
                            if (fs.existsSync(postsPath) && finalAbs === targetAbs) {
                                shouldRenameTitle = true;
                                const renamed = `${base}${restoredSuffix}${ext}`;
                                finalAbs = path.join(path.dirname(targetAbs), renamed);
                            }
                        } else if (originalDirRel.startsWith('_posts')) {
                            const draftsPath = path.join(hexo.source_dir, '_drafts', filename);
                            if (fs.existsSync(draftsPath) && finalAbs === targetAbs) {
                                shouldRenameTitle = true;
                                const renamed = `${base}${restoredSuffix}${ext}`;
                                finalAbs = path.join(path.dirname(targetAbs), renamed);
                            }
                        }
                    } catch (_) { }
                }

                // 移动回原处
                try {
                    fs.moveSync(discardedAbs, finalAbs, { overwrite: false });
                } catch (e) {
                    return res.send(500, '文件移动失败: ' + e.message);
                }

                // 如为重命名策略，同步更新 front matter 的标题，避免标题重复
                if (shouldRenameTitle) {
                    try {
                        const raw = fs.readFileSync(finalAbs, 'utf8');
                        const split = hfm.split(raw || '');
                        const parsed = hfm.parse([split.data, '---'].join('\n'));
                        const oldTitle = parsed && typeof parsed.title === 'string' ? parsed.title : (doc.title || '');
                        const newTitle = oldTitle ? `${oldTitle}${restoredSuffix}` : `${path.basename(finalAbs, path.extname(finalAbs))}`;
                        parsed.title = newTitle;
                        const fmStr = hfm.stringify(parsed);
                        const newRaw = [fmStr, split.content || ''].join('\n');
                        fs.writeFileSync(finalAbs, newRaw, 'utf8');
                    } catch (e) {
                        // 标题更新失败不阻断流程
                        console.warn('[Recycle API] 更新标题失败:', e && e.message);
                    }
                }

                // 清理空目录：自文件所在目录向上清理，直到 _discarded 根目录
                try {
                    const discardedRoot = path.resolve(hexo.source_dir, '_discarded');
                    let currentDir = path.dirname(discardedAbs);
                    while (currentDir.startsWith(discardedRoot)) {
                        // 到达根目录即停止
                        if (currentDir === discardedRoot) break;
                        const files = fs.readdirSync(currentDir);
                        if (files.length === 0) {
                            fs.rmdirSync(currentDir);
                            currentDir = path.dirname(currentDir);
                        } else {
                            break;
                        }
                    }
                } catch (_) { }

                // 移除回收站记录
                recycleDb.remove({ _id: id }, {}, async (rmErr) => {
                    if (rmErr) console.warn('[Recycle API] 移除记录失败:', rmErr);
                    try {
                        await hexo.source.process();
                    } catch (_) { }
                    return res.done({ success: true });
                });
            });
        } catch (e) {
            console.error('[Recycle API] 还原失败:', e);
            return res.send(500, '还原失败: ' + e.message);
        }
    });

    // 彻底删除
    use('recycle/delete', function (req, res, next) {
        if (req.method !== 'POST') return next();
        const { id } = req.body || {};
        if (!id) return res.send(400, '缺少ID');
        recycleDb.findOne({ _id: id }, (err, doc) => {
            if (err || !doc) return res.send(404, '未找到记录');
            try {
                const abs = path.join(hexo.source_dir, doc.discardedPath);
                if (fs.existsSync(abs)) {
                    fs.removeSync(abs);
                    // 删除文件后清理空目录
                    cleanupDiscardedEmptyDirs(abs);
                }
            } catch (e) {
                return res.send(500, '删除文件失败: ' + e.message);
            }
            recycleDb.remove({ _id: id }, {}, (rmErr) => {
                if (rmErr) return res.send(500, '删除记录失败');
                return res.done({ success: true });
            });
        });
    });

    // 清空
    use('recycle/empty', function (req, res, next) {
        if (req.method !== 'POST') return next();
        const { type, olderThanDays } = req.body || {};
        const days = Number.isFinite(olderThanDays) ? olderThanDays : null;
        const now = Date.now();
        const query = {};
        if (type && type !== 'all') query.type = type;
        recycleDb.find(query, (err, docs) => {
            if (err) return res.send(500, '清空失败');
            const toDelete = (docs || []).filter(d => {
                if (!days) return true;
                const t = new Date(d.deletedAt).getTime();
                return now - t >= days * 86400000;
            });
            for (const d of toDelete) {
                try {
                    const abs = path.join(hexo.source_dir, d.discardedPath);
                    if (fs.existsSync(abs)) {
                        fs.removeSync(abs);
                        // 删除文件后清理空目录
                        cleanupDiscardedEmptyDirs(abs);
                    }
                } catch (e) {
                    // 忽略单个错误，继续
                }
            }
            const ids = toDelete.map(d => d._id);
            recycleDb.remove({ _id: { $in: ids } }, { multi: true }, (rmErr, numRemoved) => {
                if (rmErr) return res.send(500, '清空记录失败');
                res.done({ success: true, removed: numRemoved || 0 });
            });
        });
    });
}


