'use strict';
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
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

    app.use('/hexopro/api', bodyParser.json({ limit: '50mb' }));
    app.use('/hexopro/api', bodyParser.urlencoded({ extended: true }));

    // 初始化数据库并获取 API
    const apiInstance = api(app, hexo, needLogin);
    
    // 从 API 获取实际的 needLogin 状态和 secret
    needLogin = global.actualNeedLogin;
    // 使用全局变量 global.jwtSecret，如果为空则生成新的
    if (!global.jwtSecret) {
        global.jwtSecret = crypto.randomBytes(64).toString('hex');
    }

    // 确保 JWT 中间件使用正确的 secret
    if (global.actualNeedLogin) {
        console.log('启用JWT验证，secret:', global.jwtSecret ? '已设置' : '未设置');
        console.log('排除的路径:', unlessPaths);
        
        // 使用更简单的路径匹配方式
        app.use('/hexopro/api', jwt({
            secret: global.jwtSecret,
            algorithms: ["HS256"],
            requestProperty: 'auth' // 确保将解码后的token信息存储在req.auth中
        }).unless({ path: [
            '/hexopro/api/login',
            '/hexopro/api/settings/check-first-use',
            '/hexopro/api/settings/register'
        ]}));
    }

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
