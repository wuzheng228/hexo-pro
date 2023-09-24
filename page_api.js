var path = require('path')
var url = require('url')
var fs = require('hexo-fs')
var yml = require('js-yaml')
var updateAny = require('./update'),
    update = updateAny.bind(null, 'Page')
var extend = require('extend')
const _ = require('lodash')
var hfm = require('hexo-front-matter')

module.exports = function (app, hexo, use) {
    function addIsDraft(post) {
        post.isDraft = post.source && post.source.indexOf('_draft') === 0
        post.isDiscarded = post.source && post.source.indexOf('_discarded') === 0
        post.updated = formatDateTime(post.updated)
        post.date = formatDateTime(post.date)
        return post
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
        var page = hexo.model('Page').get(id)
        page = _.cloneDeep(page)
        if (!page) return res.send(404, "Post not found")
        var newSource = path.join('_discarded/', page.source)
        update(id, { source: newSource }, function (err, page) {
            if (err) {
                return res.send(400, err);
            }
            res.done(addIsDraft(page))
        }, hexo)
    }
    use('pages/list', function (req, res) {
        var page = hexo.model('Page')
        const pages = page.toArray().map(page => {
            const { site, raw, content, _content, more, ...rest } = page
            return rest
        }).map(addIsDraft); // 使用对象解构来排除不需要的属性
        const parsedUrl = url.parse(req.url, true);
        const queryParams = parsedUrl.query;
        const { deleted } = queryParams
        if (deleted == 'false') {
            return res.done(pages.filter(page => page.isDiscarded == false))
        }
        res.done(pages);
    });

    use('pages/new', function (req, res, next) {
        if (req.method !== 'POST') return next()
        if (!req.body) {
            return res.send(400, 'No page body given');
        }
        if (!req.body.title) {
            return res.send(400, 'No title given');
        }

        hexo.post.create({ title: req.body.title, layout: 'page', date: new Date() })
            .error(function (err) {
                console.error(err, err.stack)
                return res.send(500, 'Failed to create page')
            })
            .then(function (file) {
                var source = file.path.slice(hexo.source_dir.length)

                hexo.source.process([source]).then(function () {
                    var page = hexo.model('Page').findOne({ source: source })
                    res.done(addIsDraft(page));
                });
            });
    });


    use('pages/', function (req, res, next) {
        var url = req.url
        if (url[url.length - 1] === '/') {
            url = url.slice(0, -1)
        }
        var parts = url.split('/')
        var last = parts[parts.length - 1]
        if (last === 'remove') {
            return remove(parts[parts.length - 2], req.body, res)
        }
        if (last === 'rename') {
            return rename(parts[parts.length - 2], req.body, res)
        }

        var id = last
        if (id === 'pages' || !id) return next()
        if (req.method === 'GET') {
            var page = hexo.model('Page').get(id)
            if (!page) return next()
            return res.done(addIsDraft(page))
        }

        if (!req.body) {
            return res.send(400, 'No page body given');
        }

        update(id, req.body, function (err, page) {
            if (err) {
                return res.send(400, err);
            }
            res.done({
                page: addIsDraft(page)
            })
        }, hexo);
    });

    use('pageMeta', function (req, res, next) {
        var url = req.url
        if (url[url.length - 1] === '/') {
            url = url.slice(0, -1)
        }
        var parts = url.split('/')
        var last = parts[parts.length - 1]

        var id = last
        if (req.method === 'GET') {
            var post = hexo.model('Page').get(id)
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

}