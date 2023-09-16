'use strict';
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
var path = require('path');
var api = require('./api');

hexo.extend.filter.register('before_generate', function () {
    // 在生成之前执行的逻辑
    console.log('Hexo pro 插件正在运行...');
});

hexo.extend.filter.register('server_middleware', function (app) {

    app.use((req, res, next) => {
        // 将所有请求重定向到你的应用程序的入口点
        if (req.originalUrl.startsWith('/pro')) {
            serveStatic(path.join(__dirname, 'www'))(req, res, next);
        } else {
            next();
        }
    });

    app.use('/pro', serveStatic(path.join(__dirname, 'www')));
    app.use('/hexopro/api', bodyParser.json({ limit: '50mb' }));

    // setup the json api endpoints
    api(app, hexo);
});
