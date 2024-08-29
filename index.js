'use strict';
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
var path = require('path');
var api = require('./api');
const { expressjwt: jwt } = require('express-jwt')
const fs = require('fs');
const mime = require('mime')

let needLogin = hexo.config.hexo_pro && hexo.config.hexo_pro.username
if (needLogin) {
    if (!hexo.config.hexo_pro.password) {
        console.error('[Hexo pro]: config admin.password is requred for authentication');
        needLogin = false;
    }
}

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
        constructor(title, content, isPage, isDraft, id) {
            this.title = title
            this.content = content
            this.isPage = isPage
            this.isDraft = isDraft
            this.id = id
        }
    }

    const posts = hexo.model('Post').toArray()
    const pages = hexo.model('Page').toArray()

    const blogInfoList = []

    posts.forEach((post, _) => {
        blogInfoList.push(new BlogInfo(post.title, post.content, false, !post.published, post._id))
    })

    pages.forEach((page, _) => {
        blogInfoList.push(new BlogInfo(page.title, page.content, true, false, page._id))
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
            staticMiddleware()
        } else {
            next();
        }
    });
    app.use('/pro', serve);

    if (needLogin) {
        app.use('/hexopro/api', jwt({ secret: hexo.config.hexo_pro.secret, algorithms: ["HS256"] }).unless({ path: ['/hexopro/api/login', '/pro'] }))
    }


    app.use('/hexopro/api', bodyParser.json({ limit: '50mb' }));


    // setup the json api endpoints
    api(app, hexo, needLogin);

    app.use((err, req, res, next) => {
        if (err.name === 'UnauthorizedError') {
            res.setHeader('Content-type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ code: 401, msg: 'token unauthrized' }))
        } else {
            res.setHeader('Content-type', 'application/json')
            res.statusCode = 500
            res.end(JSON.stringify({ code: 500, msg: 'unknown err:' + err }))
        }
    })


});



