var path = require('path')
var url = require('url')
var fs = require('hexo-fs')
var yml = require('js-yaml')
var updateAny = require('./update'),
    update = updateAny.bind(null, 'Post')
var extend = require('extend')
const _ = require('lodash')
var hfm = require('hexo-front-matter')
const Fuse = require('fuse.js')
const cheerio = require('cheerio')
const { v4: uuidv4 } = require('uuid');


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
    function publish(id, body, res) {
        var post = hexo.model('Post').get(id)
        if (!post) return res.send(404, "Post not found")
        var newSource = '_posts/' + post.source.slice('_drafts/'.length)
        update(id, { source: newSource }, function (err, post) {
            if (err) {
                return res.send(400, err);
            }
            post = _.cloneDeep(post)
            res.done(addIsDraft(post))
        }, hexo)
    }

    function unpublish(id, body, res) {
        var post = hexo.model('Post').get(id)
        if (!post) return res.send(404, "Post not found")
        var newSource = '_drafts/' + post.source.slice('_posts/'.length)
        update(id, { source: newSource }, function (err, post) {
            if (err) {
                return res.send(400, err);
            }
            post = _.cloneDeep(post)
            res.done(addIsDraft(post))
        }, hexo)
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
        var post = hexo.model('Post').get(id)
        post = _.cloneDeep(post)
        if (!post) return res.send(404, "Post not found")
        var newSource = path.join('_discarded/', post.source.slice('_drafts'.length))
        update(id, { source: newSource }, function (err, post) {
            if (err) {
                return res.send(400, err);
            }
            res.done(post)
        }, hexo)
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

        // 计算匹配项之间的平均距离
        const totalDistance = matchIndices.slice(1).reduce((acc, index, i) => acc + (index - matchIndices[i]), 0);
        const averageDistance = totalDistance / (matchIndices.length - 1);
        // 根据平均距离调整 contextLength
        contextLength = averageDistance < 50 ? Math.min(80, content.length) : Math.min(10, content.length);

        if (matchIndices.length === 0)
            return content.substring(0, Math.min(content.length, 300)) + '...';

        // 处理多个匹配项
        const highlightedTexts = matchIndices.map(index => {
            const start = Math.max(index - contextLength, 0);
            const end = Math.min(index + searchPattern.length + contextLength, content.length);
            let context = content.substring(start, end);

            // 高亮匹配的部分
            return context.replace(regex, '<mark>$&</mark>');
        });

        const maxContextLength = 300;
        let ans = []
        for (let i = 0; i < highlightedTexts.length; i++) {
            ans.push(highlightedTexts[i]);
            if (ans.length > maxContextLength) {
                return ans
            }
        }
        return ans.join('... ') + '...'
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
                id: item.id,
                isPage: item.isPage,
                isDraft: item.isDraft,
                title: item.title,
                context: highlightedText,
            }
        })
        res.done({ code: 0, data: enhancedResults })
    });
    use('posts/list', function (req, res) {
        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { published } = queryParams
        var post = hexo.model('Post')
        var postList = post.toArray()
        var clonedList = _.cloneDeep(postList);
        clonedList.map(addIsDraft)
        let finalList = []
        if (published == 'true') {
            finalList = clonedList.filter(post => post.isDraft === false && post.isDiscarded === false)
        } else {
            finalList = clonedList.filter(post => post.isDraft === true)
        }
        var sortedList = finalList.sort(function (a, b) {
            var dateA = new Date(a.date);
            var dateB = new Date(b.date);
            return dateB - dateA; // 比较日期值而不是整个对象
        });
        res.done(sortedList.map(post => {
            const { site, raw, content, more, tags, _content, categories, ...rest } = post; // 使用对象解构来排除不需要的属性
            return rest; // 返回剩余的属性
        }));
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

                    res.done(addIsDraft(post));
                });
            });
    })
    // 查询单个博客信息
    use('posts', function (req, res, next) {
        var url = req.url
        if (url[url.length - 1] === '/') {
            url = url.slice(0, -1)
        }
        var parts = url.split('/')
        var last = parts[parts.length - 1]

        var id = last
        if (last === 'publish') {
            // console.log(parts)
            // console.log(typeof parts[parts.length - 2])
            return publish(parts[parts.length - 2], req.body, res)
        }
        if (last === 'unpublish') {
            return unpublish(parts[parts.length - 2], req.body, res)
        }
        if (last === 'remove') {
            return remove(parts[parts.length - 2], req.body, res)
        }

        if (id === 'posts' || !id) next()
        if (req.method === 'GET') {
            var post = hexo.model('Post').get(id)
            if (!post) next()
            post = _.cloneDeep(post)
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

    use('postMeta', function (req, res, next) {
        var url = req.url
        if (url[url.length - 1] === '/') {
            url = url.slice(0, -1)
        }
        var parts = url.split('/')
        var last = parts[parts.length - 1]

        var id = last
        if (req.method === 'GET') {
            var post = hexo.model('Post').get(id)
            if (!post) {
                next()
                return
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
    use('images/upload', async function (req, res, next) {
        if (req.method !== 'POST') return next();
        if (!req.body) {
            return res.send(400, 'No post body given');
        }
        if (!req.body.data) {
            return res.send(400, 'No data given');
        }

        const imagePath = '/images';
        let imagePrefix = 'pasted-';
        if (req.body.filename) {
            imagePrefix = req.body.filename
        }

        // function generateShortId() {
        //     const uuid = uuidv4().replace(/-/g, ''); // 生成 UUID 并去除分隔符
        //     return uuid.substring(0, 10); // 截取前10个字符
        // }

        const msg = 'upload successful';
        // const shortId = generateShortId(); // 生成短唯一标识符
        const filename = `${imagePrefix}-${uuidv4()}-${Date.now()}.png`;

        const outpath = path.join(hexo.source_dir, imagePath, filename);

        // Ensure directory exists
        if (!fs.existsSync(path.dirname(outpath))) {
            fs.mkdirsSync(path.dirname(outpath));
        }

        try {
            // Strip out the data prefix for base64 encoded images
            const dataURI = req.body.data.replace(/^data:image\/\w+;base64,/, '');
            const buf = Buffer.from(dataURI, 'base64');

            console.log(`Saving image to ${outpath}`);

            // Asynchronous write with a promise
            await fs.writeFile(outpath, buf);

            const encodedFilename = encodeURIComponent(filename)
            // Generate the correct src path
            const imageSrc = `${imagePath}/${encodedFilename}`;


            // Process the source to ensure it is correctly added to Hexo's file structure
            // await hexo.source.process();
            // throw new Error('hexo.source.process() should have resolved the promise');
            res.done({
                src: imageSrc,
                msg: msg
            });
        } catch (error) {
            hexo.log.e(`Error saving image: ${error.message}`);
            return res.send(500, 'Failed to save image');
        }
    });

}