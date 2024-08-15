var path = require('path')
var url = require('url')
var fs = require('hexo-fs')
var yml = require('js-yaml')
var updateAny = require('./update'),
    update = updateAny.bind(null, 'Post')
var extend = require('extend')
const _ = require('lodash')
var hfm = require('hexo-front-matter')

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
        post.isDraft = post.source.indexOf('_draft') === 0
        post.isDiscarded = post.source.indexOf('_discarded') === 0
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
            var split = hfm.split(post.raw)
            // console.log('-----> split data', split.data)
            var parsed = hfm.parse([split.data, '---'].join('\n'))
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
            if (!post) next()
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
    use('images/upload', function (req, res, next) {
        if (req.method !== 'POST') return next()
        if (!req.body) {
            return res.send(400, 'No post body given')
        }
        if (!req.body.data) {
            return res.send(400, 'No data given')
        }
        var imagePath = '/images'
        var imagePrefix = 'pasted-'

        var msg = 'upload successful'
        var timestamp = new Date().getTime()
        var filename = imagePrefix + timestamp + '.png'

        filename = path.join(imagePath, filename)
        var outpath = path.join(hexo.source_dir, filename)

        var dataURI = req.body.data.slice('data:image/png;base64,'.length)
        var buf = new Buffer(dataURI, 'base64')
        hexo.log.d(`saving image to ${outpath}`)
        fs.writeFile(outpath, buf)
        var imageSrc = path.join((hexo.config.root) + filename).replace(/\\/g, '/')
        hexo.source.process().then(function () {
            res.done({
                src: imageSrc,
                msg: msg
            })
        });
    })
}