// 导入 Hexo 模块
const Hexo = require('hexo');
const path = require('path');
const chokidar = require('chokidar');
const browserSync = require('browser-sync').create();

// 创建 Hexo 实例
async function startHexoServer() {
    const hexo = new Hexo(path.resolve(__dirname, '/Users/warms/Workspace/code/node_project/blog'), { cache: false });

    // 初始化 Hexo
    await hexo.init().then(function () {
        return hexo.load();
    }).then(function () {
        console.log('Hexo 初始化完成，开始调试');
        console.log('Hexo 版本:', hexo.version);
    }).catch(function (err) {
        console.error('Hexo 初始化失败:', err);
    });

    // 启动 Hexo 服务器
    const server = await hexo.call('server', {
        port: 8001,
        ip: '127.0.0.1'  // 限制只监听本地环回地址
    });

    console.log('Hexo server is running at http://localhost:7001');

    // 启动 browser-sync 进行自动刷新
    browserSync.init({
        proxy: 'http://localhost:8001',
        files: ['public/**/*', 'themes/butterfly/**/*'],
        notify: false,
        open: 'external', // 尝试用 'external'
        ui: false,
        port: 8081,
    });

    // 使用 chokidar 监听 butterfly 主题目录的变化
    const themePath = path.join(hexo.base_dir, 'themes', 'butterfly'); // butterfly 主题目录

    // 创建 watcher 监听主题目录
    const watcher = chokidar.watch(themePath, {
        ignored: /^\./,  // 忽略隐藏文件
        persistent: true,
    });

    watcher.on('change', async (filePath) => {
        console.log(`文件变动: ${filePath}`);
        // 当文件变化时重新生成静态文件
        await hexo.call('generate', {});
        console.log('Hexo 页面已重新生成');

        // 告诉 browser-sync 重新加载浏览器
        browserSync.reload();
    });

    // 监听结束后输出
    watcher.on('error', (error) => console.error('监听错误:', error));
}

// 启动 Hexo 服务器
startHexoServer().catch(err => {
    console.error(err);
});
