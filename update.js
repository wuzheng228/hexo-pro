var path = require('path'),
    moment = require('moment'),
    hfm = require('hexo-front-matter'),
    fs = require('hexo-fs'),
    extend = require('extend');
const utils = require('./utils');
//  yfm = util.yfm,
//  escape = util.escape;


/**
 * Updates a post.
 *
 * @method update
 * @param {str} model the type of model being updated
 * @param {Object} post a post model
 * @param {Object} update attributes to update
 * @param {Function} callback
 */

module.exports = function (model, unimark, update, callback, hexo) {
    unimark = utils.base64Decode(unimark)
    const newFrontMatter = update.frontMatter
    if (newFrontMatter) {
        delete update.frontMatter
    }

    // console.log(newFrontMatter)
    function removeExtname(str) {
        return str.substring(0, str.length - path.extname(str).length);
    }
    var post = hexo.model(model).filter(post => {

        return unimark === post.permalink;
    }).data[0];
    if (!post) {
        return callback('Post not found');
    }
    var config = hexo.config,
        layout = post.layout = (post.layout || config.default_layout).toLowerCase(),
        // 添加时间戳确保唯一性
        slug = post.slug = `${hfm.escape(post.slug || post.title, config.filename_case)}-${Date.now()}`,
        date = post.date = post.date ? moment(post.date) : moment();
    // console.log("post.raw:", post.raw)
    var split = hfm.split(post.raw),
        frontMatter = split.data
    compiled = hfm.parse([frontMatter, '---', split.content].join('\n'));

    var preservedKeys = ['title', 'date', 'tags', 'categories', '_content', 'author'];
    Object.keys(hexo.config.metadata || {}).forEach(function (key) {
        preservedKeys.push(key);
    });
    var prev_full = post.full_source,
        full_source = prev_full;
    if (update.source && update.source !== post.source) {
        // post.full_source only readable ~ see: /hexo/lib/models/post.js
        full_source = hexo.source_dir + update.source
    }

    preservedKeys.forEach(function (attr) {
        if (attr in update) {
            compiled[attr] = update[attr]
        }
    });
    compiled.date = moment(compiled.date).toDate()

    if (newFrontMatter) {
        Object.keys(newFrontMatter).forEach(name => {
            compiled[name] = newFrontMatter[name]
        })
        Object.keys(compiled).forEach(name => {
            if (['title', 'date', 'tags', 'categories', '_content', 'author'].includes(name)) {
                return
            }
            if (Object.keys(newFrontMatter).includes(name)) {
                return
            }
            // console.log('delete', name)
            delete compiled[name]
        })
    }

    delete update._content
    var raw = hfm.stringify(compiled);
    update.raw = raw
    update.updated = moment()
    update.slug = slug

    // tags and cats are only getters now. ~ see: /hexo/lib/models/post.js
    if (typeof update.tags !== 'undefined') {
        post.setTags(update.tags)
        delete update.tags
    }
    if (typeof update.categories !== 'undefined') {
        post.setCategories(update.categories)
        delete update.categories
    }

    extend(post, update)

    post.save().then(async () => {
        fs.writeFileSync(full_source, raw);
        hexo.log.info('文章保存成功！');
        await hexo.source.process().then(function () {
            //      console.log(post.full_source, post.source)
            callback(null, hexo.model(model).filter(post => {
                const permalink = post.permalink;
                return unimark === permalink;
            }).data[0]);
        });
    }).catch(err => {
        hexo.log.error('保存失败:', err);
        callback(err, null);
    });


}
