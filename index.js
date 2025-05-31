'use strict';
var serveStatic = require('serve-static');
var path = require('path');
var api = require('./api');
const { expressjwt: jwt } = require('express-jwt')
const fs = require('fs');
const mime = require('mime')
// 添加查询字符串解析中间件
const querystring = require('querystring');
const crypto = require('crypto');

// 修改：不再从 _config.yml 获取登录信息，而是在 api 中根据数据库判断
let needLogin = false; // 默认不需要登录，将在 api.js 中根据数据库内容决定

function staticMiddleware(rootDir) {
    return function (req, res, next) {
        // 获取请求的文件路径
        const filePath = path.join(rootDir, req.url);

        // 使用 fs 模块检查文件是否存在
        fs.exists(filePath, (exists) => {
            if (!exists) {
                // 如果文件不存在，调用 next() 将请求传递给下一个中间件或路由处理程序
                return next();
            }

            // 使用 mime 模块获取文件的 MIME 类型
            const contentType = mime.getType(filePath);

            // 设置响应头，指定正确的 MIME 类型
            res.setHeader('Content-Type', contentType);

            // 使用 fs 模块创建可读流并将文件内容传输到响应
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        });
    };
}


function buildIndex() {
    class BlogInfo {
        constructor(title, content, isPage, isDraft, permalink) {
            this.title = title
            this.content = content
            this.isPage = isPage
            this.isDraft = isDraft
            this.permalink = permalink
        }
    }

    const posts = hexo.model('Post').toArray()
    const pages = hexo.model('Page').toArray()

    const blogInfoList = []

    posts.forEach((post, _) => {
        blogInfoList.push(new BlogInfo(post.title, post.content, false, !post.published, post.permalink))
    })

    pages.forEach((page, _) => {
        blogInfoList.push(new BlogInfo(page.title, page.content, true, false, page.permalink))
    })

    fs.writeFileSync(path.join(hexo.base_dir, 'blogInfoList.json'), JSON.stringify(blogInfoList))
}

const serve = serveStatic(path.join(__dirname, 'www'))

hexo.extend.filter.register('before_generate', function () {
    buildIndex();
    // 在生成之前执行的逻辑
});

hexo.extend.filter.register('after_init', async function () {
    await hexo.load(); // 确保所有数据已加载
    // 将博客数据写入到文件当中
    buildIndex();
});

hexo.extend.filter.register('after_post_render', function (data) {
    return data;
});

hexo.extend.filter.register('server_middleware', function (app) {

    // 添加查询字符串解析中间件
    app.use((req, res, next) => {
        if (!req.query && req.url.includes('?')) {
            const queryStr = req.url.split('?')[1];
            req.query = querystring.parse(queryStr);
        }
        next();
    });

    // console.log("posts=>", hexo.locals.get("posts"))
    // 检查请求的URL是否以静态文件后缀结尾
    app.use((req, res, next) => {
        // 将所有请求重定向到你的应用程序的入口点
        if (req.originalUrl.startsWith('/pro')) {
            const isStaticFile = ['.html', '.css', '.js', '.jpg', '.png', '.gif'].some(extension => req.originalUrl.endsWith(extension));
            let filePath = path.join(__dirname, 'www', "index.html");
            if (isStaticFile) {
                filePath = path.join(__dirname, 'www', req.originalUrl.substring(4));
            }
            // 使用 fs 模块读取文件并将其发送给客户端
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    // 处理文件读取错误
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                } else {
                    // 发送文件内容
                    // 使用 mime 模块获取文件的 MIME 类型
                    const contentType = mime.getType(filePath);

                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                }
            });
            // staticMiddleware()
        } else {
            next();
        }
    });
    app.use('/pro', serve);

    console.log(hexo.config.root)

    let root = hexo.config.root
    if (!root) {
        root = ''
    }

    const unlessPaths = [
        hexo.config.root + 'hexopro/api/login', 
        hexo.config.root + 'hexopro/api/settings/check-first-use',
        hexo.config.root + 'hexopro/api/settings/register',
        hexo.config.root + 'pro'
    ]
    console.log(unlessPaths)
    // 初始化数据库并获取 API
    // api(app, hexo, needLogin); // 旧的调用方式
    api(app, hexo).catch(err => { // 调用 async 函数，并添加错误处理
        console.error('[Hexo Pro]: API 初始化过程中发生未捕获错误:', err);
    });

});

// 导出buildIndex函数供桌面端使用
module.exports = {
    buildIndex: buildIndex
};
