var path = require('path')
var url = require('url')
var fs = require('hexo-fs')
var fse = require('fs-extra')
var yml = require('js-yaml')
var updateAny = require('./update'),
    update = updateAny.bind(null, 'Post')
var extend = require('extend')
const _ = require('lodash')
var hfm = require('hexo-front-matter')
const Fuse = require('fuse.js')
const cheerio = require('cheerio')
const { v4: uuidv4 } = require('uuid');

const utils = require('./utils');
const { permalink } = require('hexo/dist/hexo/default_config')


module.exports = function (app, hexo, use) {
    // reads admin panel settings from _admin-config.yml
    // or writes it if it does not exist
    function getSettings() {
        var path = hexo.base_dir + '_admin-config.yml'
        if (!fs.existsSync(path)) {
            hexo.log.d('admin config not found, creating one')
            fs.writeFile(hexo.base_dir + '_admin-config.yml', '')
            return {}
        } else {
            var settings = yml.load(fs.readFileSync(path))

            if (!settings) return {}
            return settings
        }
    }
    function tagsCategoriesAndMetadata() {
        var cats = {}
            , tags = {}
        hexo.model('Category').forEach(function (cat) {
            cats[cat._id] = cat.name
        })
        hexo.model('Tag').forEach(function (tag) {
            tags[tag._id] = tag.name
        })
        return {
            categories: cats,
            tags: tags,
            metadata: Object.keys(hexo.config.metadata || {})
        }
    }
    function addIsDraft(post) {
        if (!post) return post
        post.isDraft = post.source?.indexOf('_draft') === 0
        post.isDiscarded = post.source?.indexOf('_discarded') === 0
        post.updated = formatDateTime(post.updated)
        post.date = formatDateTime(post.date)
        return post
    }
    function publish(permalink, body, res) {
        // 优先通过ID查找，找不到时通过文件名查找
        permalink = utils.base64Decode(permalink)
        var post = hexo.model('Post').filter(p => p.permalink === permalink).data[0];

        if (!post) return res.send(404, "Post not found");

        const originalFilename = path.basename(post.source);
        const originalDirname = path.dirname(post.source);
        const newSource = '_posts/' + originalFilename;
        const oldPath = path.join(hexo.source_dir, post.source);
        const newDir = path.join(hexo.source_dir, path.dirname(newSource));
        let newPath = path.join(newDir, originalFilename);

        // 使用 fse 确保目录存在
        fse.ensureDir(newDir, err => {
            if (err) return res.send(500, `Failed to create directory: ${err.message}`);

            // 使用 fse 移动文件到新路径下
            fse.move(oldPath, newPath, { overwrite: false }, async err => {
                if (err) {
                    // 如果源和目标相同或目标已存在，采用重命名策略避免报错
                    const isSame = /must not be the same/i.test(err.message || '');
                    const exists = /dest already exists|EEXIST/i.test(err.message || '') || fse.pathExistsSync(newPath);
                    if (!(isSame || exists)) {
                        return res.send(500, `File operation failed: ${err.message}`);
                    }

                    const ext = path.extname(originalFilename);
                    const base = path.basename(originalFilename, ext);
                    const renamed = `${base} (${Date.now()})${ext}`;
                    newPath = path.join(newDir, renamed);
                    try {
                        await fse.move(oldPath, newPath, { overwrite: false });
                    } catch (e2) {
                        return res.send(500, `File operation failed: ${e2.message}`);
                    }
                }

                // 更新数据模型中的 post 源路径
                post.source = path.join('_posts', path.basename(newPath)).replace(/\\/g, '/');
                post = _.cloneDeep(post);

                // 刷新 Hexo 数据
                await hexo.source.process().then(() => {
                    res.done(addIsDraft(post))
                }).catch(e => {
                    console.error(e, e.stack)
                    res.send(500, 'Failed to refresh data')
                })
                // 直接更新数据库中的source路径
                // hexo.model('Post').update(post._id, { source: newSource });
                // res.done(addIsDraft(post));
            });
        });
    }

    function unpublish(permalink, body, res) {
        // 优先通过ID查找，找不到时通过文件名查找
        permalink = utils.base64Decode(permalink)
        var post = hexo.model('Post').filter(p => p.permalink === permalink).data[0];
        if (!post) return res.send(404, "Post not found");

        const originalFilename = path.basename(post.source);
        const originalDirname = path.dirname(post.source);
        const newSource = '_drafts/' + originalFilename;
        const oldPath = path.join(hexo.source_dir, post.source);
        const newDir = path.join(hexo.source_dir, path.dirname(newSource));
        const newPath = path.join(newDir, originalFilename);

        // 使用 fse 确保目录存在
        fse.ensureDir(newDir, err => {
            if (err) return res.send(500, `Failed to create directory: ${err.message}`);

            // 使用 fse 移动文件到新路径下
            fse.move(oldPath, newPath, { overwrite: false }, async err => {
                if (err) return res.send(500, `File operation failed: ${err.message}`);

                // 更新数据模型中的 post 源路径
                post.source = newSource;
                post = _.cloneDeep(post);

                // 刷新 Hexo 数据
                await hexo.source.process().then(() => {
                    res.done(addIsDraft(post))
                }).catch(e => {
                    console.error(e, e.stack)
                    res.send(500, 'Failed to refresh data')
                })
                // // 直接更新数据库中的source路径
                // hexo.model('Post').update(post._id, { source: newSource });
                // res.done(addIsDraft(post));
            });
        });
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
        var post = hexo.model('Post').filter(p => p.permalink === id).data[0];
        post = _.cloneDeep(post)
        if (!post) return res.send(404, "Post not found")

        const originalFilename = path.basename(post.source)
        const originalDirname = path.dirname(post.source)
        const newSource = path.join('_discarded', String(Date.now()), originalDirname, originalFilename)
        const oldPath = path.join(hexo.source_dir, post.source)
        const newDir = path.join(hexo.source_dir, path.dirname(newSource))
        const newPath = path.join(newDir, originalFilename)

        // 使用 fse 确保目录存在
        fse.ensureDir(newDir, err => {
            if (err) return res.send(500, `Failed to create directory: ${err.message}`)

            // 使用 fse 移动文件到新路径下
            fse.move(oldPath, newPath, { overwrite: false }, err => {
                if (err) return res.send(500, `File operation failed: ${err.message}`)
                // 从数据模型中删除页面记录
                hexo.model('Post').remove({ _id: post._id }, err => {
                    if (err) return res.send(500, `Failed to remove post from model: ${err.message}`)

                    // 刷新 Hexo 数据
                    hexo.source.process().then(() => {
                        // 写入回收站记录（使用全局数据库管理器）
                        try {
                            const databaseManager = require('./database-manager');
                            if (databaseManager && databaseManager.isReady()) {
                                const { recycleDb } = databaseManager.getDatabases();
                                if (recycleDb) {
                                    recycleDb.insert({
                                        type: 'post',
                                        title: post.title,
                                        permalink: post.permalink,
                                        originalSource: post.source,
                                        discardedPath: newSource.replace(/\\/g, '/'),
                                        isDraft: post.source && post.source.indexOf('_draft') === 0,
                                        deletedAt: new Date(),
                                    }, function () { });
                                }
                            }
                        } catch (_) { }
                        res.done(addIsDraft(post))
                    }).catch(e => {
                        console.error(e, e.stack)
                        res.send(500, 'Failed to refresh data')
                    })
                })

            })
        })
    }

    function loadBlogInfoList() {
        const blogInfoList = fs.readFileSync(path.join(hexo.base_dir, 'blogInfoList.json'));
        return JSON.parse(blogInfoList);
    }
    function getHighlightedTextFromHtml(content, searchPattern, contextLength = 40) {
        if (!content || content.trim() === '') {
            return '...'
        }
        // 使用 cheerio 移除 HTML 标签
        const $ = cheerio.load(content);
        content = $.text();

        content = content.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

        // 安全地处理搜索模式
        const safePattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 转义特殊字符
        const regex = new RegExp(safePattern, 'gi');

        const matchIndices = [...content.matchAll(regex)].map(m => m.index);

        // 如果没有匹配项，返回内容的前300个字符
        if (matchIndices.length === 0)
            return content.substring(0, Math.min(content.length, 300)) + '...';

        // 计算匹配项之间的平均距离
        const totalDistance = matchIndices.slice(1).reduce((acc, index, i) => acc + (index - matchIndices[i]), 0);
        const averageDistance = matchIndices.length > 1 ? totalDistance / (matchIndices.length - 1) : 0;

        // 根据平均距离调整 contextLength
        contextLength = averageDistance < 50 ? Math.min(80, content.length) : Math.min(40, content.length);

        // 创建匹配片段
        let segments = [];
        let processedIndices = new Set();

        // 首先处理彼此接近的匹配项，将它们合并为一个片段
        for (let i = 0; i < matchIndices.length; i++) {
            if (processedIndices.has(i)) continue;

            const currentIndex = matchIndices[i];
            let endIndex = currentIndex;
            let j = i + 1;

            // 查找接近的匹配项
            while (j < matchIndices.length && matchIndices[j] - endIndex < contextLength * 2) {
                endIndex = matchIndices[j];
                processedIndices.add(j);
                j++;
            }

            // 创建包含多个匹配项的片段
            const start = Math.max(currentIndex - contextLength, 0);
            const end = Math.min(endIndex + searchPattern.length + contextLength, content.length);
            let segment = content.substring(start, end);

            // 计算此片段中包含的匹配项数量
            const matchCount = segment.match(regex)?.length || 0;

            segments.push({
                text: segment.replace(regex, '<mark>$&</mark>'),
                matchCount: matchCount,
                originalIndex: i
            });
        }

        // 处理剩余的单个匹配项
        for (let i = 0; i < matchIndices.length; i++) {
            if (processedIndices.has(i)) continue;

            const index = matchIndices[i];
            const start = Math.max(index - contextLength, 0);
            const end = Math.min(index + searchPattern.length + contextLength, content.length);
            let segment = content.substring(start, end);

            segments.push({
                text: segment.replace(regex, '<mark>$&</mark>'),
                matchCount: 1,
                originalIndex: i
            });
        }

        // 按匹配数量排序，优先显示包含多个匹配项的片段
        segments.sort((a, b) => {
            // 首先按匹配数量降序排序
            if (b.matchCount !== a.matchCount) {
                return b.matchCount - a.matchCount;
            }
            // 匹配数量相同时，按原始顺序排序
            return a.originalIndex - b.originalIndex;
        });

        // 限制片段数量，最多显示3个片段
        segments = segments.slice(0, 3);

        // 按原始顺序重新排序片段
        segments.sort((a, b) => a.originalIndex - b.originalIndex);

        // 组合最终结果
        return segments.map(s => s.text).join('... ') + '...';
    }

    use('blog/search', function (req, res) {
        const fuseOptions = {
            includeScore: true,
            keys: ['title', 'content']
        };

        const blogInfoList = loadBlogInfoList()
        const fuse = new Fuse(blogInfoList, fuseOptions);

        const results = fuse.search(req.body.searchPattern)
        // 返回搜索结果
        const enhancedResults = results.map(result => {
            const { item } = result;
            const highlightedText = getHighlightedTextFromHtml(item.content, req.body.searchPattern);
            return {
                permalink: item.permalink,
                isPage: item.isPage,
                isDraft: item.isDraft,
                title: item.title,
                context: highlightedText,
            }
        })
        res.done({ code: 0, data: enhancedResults })
    });

    use('posts/check-title', function (req, res) {
        const { title, excludeId } = req.query

        // 查找除了指定 ID 外的所有文章
        const posts = hexo.model('Post').filter(p => {
            if (excludeId) {
                const decodedId = utils.base64Decode(excludeId)
                return p.title === title && p.permalink !== decodedId
            }
            return p.title === title
        }).data

        res.done({ exists: posts.length > 0 })
    })

    use('posts/list', function (req, res) {
        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { published, page = 1, pageSize = 12 } = queryParams;

        var post = hexo.model('Post');
        var postList = post.toArray();
        var clonedList = _.cloneDeep(postList);
        clonedList.map(addIsDraft);

        let finalList = [];
        if (published == 'true') {
            finalList = clonedList.filter(post => post.isDraft === false && post.isDiscarded === false);
        } else {
            finalList = clonedList.filter(post => post.isDraft === true);
        }

        var sortedList = finalList.sort(function (a, b) {
            var dateA = new Date(a.date);
            var dateB = new Date(b.date);
            return dateB - dateA;
        });

        // 分页处理
        const total = sortedList.length;
        const startIndex = (Math.max(parseInt(page), 1) - 1) * parseInt(pageSize);
        const endIndex = startIndex + parseInt(pageSize);
        const paginatedData = sortedList.slice(startIndex, endIndex);

        res.done({
            total: total,
            data: paginatedData.map(post => {
                const { site, raw, content, more, tags, _content, categories, ...rest } = post;
                return rest;
            })
        });
    });
    use('posts/page/list', function (req, res) {
        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { page, pageSize } = queryParams;
        const data = hexo.model('Post')
        // 计算起始索引和结束索引
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + parseInt(pageSize);

        // 根据分页参数截取数据
        const paginatedData = data.slice(startIndex, endIndex);

        res.done(paginatedData);
    });
    use('posts/new', function (req, res, next) {
        if (req.method !== 'POST') return next()
        if (!req.body) {
            return res.send(400, "No post body given")
        }
        if (!req.body.title) {
            return res.send(400, "No title given")
        }

        var postParameters = { title: req.body.title, layout: 'draft', date: new Date(), author: hexo.config.author };
        extend(postParameters, hexo.config.metadata || {})
        hexo.post.create(postParameters)
            .error(function (err) {
                console.error(err, err.stack)
                return res.send(500, 'Failed to create post')
            })
            .then(function (file) {
                var source = file.path.slice(hexo.source_dir.length)
                hexo.source.process([source]).then(function () {
                    var post = _.cloneDeep(hexo.model('Post').findOne({ source: source.replace(/\\/g, '\/') }))

                    return res.done(addIsDraft(post));
                });
            });
    })
    // 查询单个博客信息
    use('posts/:param1/:param2', function (req, res, next) {
        var last = req.params.param2
        if (last === 'publish') {
            // console.log(parts)
            // console.log(typeof parts[parts.length - 2])
            return publish(req.params.param1, req.body, res)
        }
        if (last === 'unpublish') {
            return unpublish(req.params.param1, req.body, res)
        }
        if (last === 'remove') {
            return remove(req.params.param1, req.body, res)
        }
        var id = req.params.param2
        if (id === 'posts' || !id) return next();
        if (req.method === 'GET') {
            id = utils.base64Decode(id)
            console.log("Posts route: Searching for post with id:", id);
            // 使用findOne代替filter+[0]，避免undefined问题
            let post = hexo.model('Post').filter(post => {
                const permalink = post.permalink;
                // console.log("Checking slug:", permalink, "Match result:", id === permalink);
                return id === permalink;
            });
            // 如果没找到匹配的文章
            if (!post) {
                console.log("Posts route: No post found with slug:", id);
                return next();
            }
            post = _.cloneDeep(post.data[0])
            // console.log(Object.keys(post))
            // console.log(post.tags)
            // console.log(post.categories)
            // console.log(post.top_img)
            // var split = hfm.split(post.raw)
            // // console.log('-----> split data', split.data)
            // var parsed = hfm.parse([split.data, '---'].join('\n'))
            // console.log('-----> split parsed', parsed)
            return res.done(addIsDraft(post))
        }

    })

    use('posts/:param1', function (req, res, next) {
        var id = req.params.param1
        if (id === 'posts' || !id) return next();
        if (req.method === 'GET') {
            id = utils.base64Decode(id)
            console.log("Posts route: Searching for post with id:", id);
            // 使用findOne代替filter+[0]，避免undefined问题
            let post = hexo.model('Post').filter(post => {
                const permalink = post.permalink;
                // console.log("Checking slug:", permalink, "Match result:", id === permalink);
                return id === permalink;
            });
            // 如果没找到匹配的文章
            if (!post) {
                console.log("Posts route: No post found with slug:", id);
                return next();
            }
            post = _.cloneDeep(post.data[0])
            // console.log(Object.keys(post))
            // console.log(post.tags)
            // console.log(post.categories)
            // console.log(post.top_img)
            // var split = hfm.split(post.raw)
            // // console.log('-----> split data', split.data)
            // var parsed = hfm.parse([split.data, '---'].join('\n'))
            // console.log('-----> split parsed', parsed)
            return res.done(addIsDraft(post))
        }

    })

    use('post/update/:id', function (req, res, next) {
        let id = req.params.id
        if (!req.body) {
            return res.send(400, 'No post body given')
        }

        update(id, req.body, function (err, post) {
            if (err) {
                return res.send(400, err)
            }
            post = _.cloneDeep(post)
            res.done({
                post: addIsDraft(post),
                tagsCategoriesAndMetadata: tagsCategoriesAndMetadata()
            })
        }, hexo)
    })

    use('postMeta/:id', function (req, res, next) {
        var id = req.params.id
        if (req.method === 'GET') {
            console.log("Searching for post with id:", id);
            id = utils.base64Decode(id)
            // 使用findOne代替filter+[0]，避免undefined问题
            var post = hexo.model('Post').filter(post => {
                const permalink = post.permalink;
                // console.log("Checking slug:", permalink, "Match result:", id === permalink);
                return id === permalink;
            }).data[0];

            // 如果没找到匹配的文章
            if (!post) {
                console.log("No post found with slug:", id);
                // 列出所有可用的slug供调试
                console.log("Available slugs:", hexo.model('Post').toArray().map(p => p.slug).join(', '));
                next();
                return;
            }
            var split = hfm.split(post.raw)
            // console.log('-----> split data', split.data)
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
            return res.done(ans)
        }
    })

    use('tags-categories-and-metadata', function (req, res, next) {
        return res.done(tagsCategoriesAndMetadata())
    })

    use('settings/list', function (req, res, next) {
        res.done(getSettings())
    })
    // use('images/upload', async function (req, res, next) {
    //     if (req.method !== 'POST') return next();
    //     if (!req.body) {
    //         return res.send(400, 'No post body given');
    //     }
    //     if (!req.body.data) {
    //         return res.send(400, 'No data given');
    //     }

    //     const imagePath = '/images';
    //     let imagePrefix = 'pasted-';
    //     if (req.body.filename) {
    //         imagePrefix = req.body.filename
    //     }

    //     // function generateShortId() {
    //     //     const uuid = uuidv4().replace(/-/g, ''); // 生成 UUID 并去除分隔符
    //     //     return uuid.substring(0, 10); // 截取前10个字符
    //     // }

    //     const msg = 'upload successful';
    //     // const shortId = generateShortId(); // 生成短唯一标识符
    //     const filename = `${imagePrefix}-${uuidv4()}-${Date.now()}.png`;

    //     const outpath = path.join(hexo.source_dir, imagePath, filename);

    //     // Ensure directory exists
    //     if (!fs.existsSync(path.dirname(outpath))) {
    //         fs.mkdirsSync(path.dirname(outpath));
    //     }

    //     try {
    //         // Strip out the data prefix for base64 encoded images
    //         const dataURI = req.body.data.replace(/^data:image\/\w+;base64,/, '');
    //         const buf = Buffer.from(dataURI, 'base64');

    //         console.log(`Saving image to ${outpath}`);

    //         // Asynchronous write with a promise
    //         await fs.writeFile(outpath, buf);

    //         const encodedFilename = encodeURIComponent(filename)
    //         // Generate the correct src path
    //         const imageSrc = `${imagePath}/${encodedFilename}`;


    //         // Process the source to ensure it is correctly added to Hexo's file structure
    //         // await hexo.source.process();
    //         // throw new Error('hexo.source.process() should have resolved the promise');
    //         res.done({
    //             src: imageSrc,
    //             msg: msg
    //         });
    //     } catch (error) {
    //         hexo.log.e(`Error saving image: ${error.message}`);
    //         return res.send(500, 'Failed to save image');
    //     }
    // });


    // 新增接口：更新文章的frontMatter
    use('updateFrontMatter', function (req, res, next) {
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
        update(permalink, { frontMatter: frontMatterUpdate }, function (err, post) {
            if (err) {
                return res.send(400, err);
            }
            post = _.cloneDeep(post);
            res.done(addIsDraft(post));
        }, hexo);
    });



}

