// webpack.dev.js
const path = require("path")
const ESLintWebpackPlugin = require("eslint-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin")
const CopyPlugin = require("copy-webpack-plugin")

const getStyleLoaders = (preProcessor) => {
    console.log(path.resolve(__dirname, "../client/src"))
    return [
        "style-loader",
        "css-loader",
        {
            loader: "postcss-loader",
            options: {
                postcssOptions: {
                    plugins: [
                        "postcss-preset-env", // 能解决大多数样式兼容性问题
                    ],
                },
            },
        },
        preProcessor,
    ].filter(Boolean)
}

module.exports = {
    // 入口
    entry: "./client/src/index.tsx",
    // 输出
    output: {
        path: undefined,
        publicPath: '/pro',
        filename: 'static/js/[name].js',
        chunkFilename: 'static/js/[name].chunk.js',
        assetModuleFilename: 'static/media/[hash:10][ext][query]',
    },
    // 加载器
    module: {
        rules: [
            {
                oneOf: [
                    {
                        // 用来匹配 .css 结尾的文件
                        test: /\.css$/,
                        // use 数组里面 Loader 执行顺序是从右到左
                        use: getStyleLoaders(),
                        include: /\.module\.css$/,
                    },
                    {
                        // 用来匹配 .css 结尾的文件
                        test: /\.css$/,
                        // use 数组里面 Loader 执行顺序是从右到左
                        use: [
                            'style-loader',
                            'css-loader'
                        ],
                        exclude: /(\.module\.css$)/
                    },
                    {
                        test: /\.less$/,
                        use: getStyleLoaders("less-loader"),
                        include: /\.module\.less$/,
                        exclude: [/node_modules/]
                    },
                    {
                        test: /\.less$/,
                        use: getStyleLoaders("less-loader"),
                        exclude: /\.module\.less$/
                    },
                    // {
                    //     test: /\.s[ac]ss$/,
                    //     use: getStyleLoaders("sass-loader"),
                    // },
                    // {
                    //     test: /\.styl$/,
                    //     use: getStyleLoaders("stylus-loader"),
                    // },
                    {
                        test: /\.(png|jpe?g|gif)$/,
                        type: "asset",
                        parser: {
                            dataUrlCondition: {
                                maxSize: 10 * 1024, // 小于10kb的图片会被base64处理
                            },
                        },
                    },
                    {
                        test: /\.svg$/,
                        use: ['@svgr/webpack'],
                    },
                    {
                        test: /\.(ttf|woff2?)$/,
                        type: "asset/resource",
                    },
                    // {
                    //     enforce: 'pre',
                    //     test: /\.(jsx|js)$/, // 也可以是其他你想要检查的文件类型
                    //     exclude: /node_modules/,
                    //     use: 'eslint-loader',
                    // },
                    {
                        test: /\.(tsx|js|ts)$/,
                        include: path.resolve(__dirname, "../client/src"),
                        loader: "babel-loader",
                        options: {
                            cacheDirectory: true,
                            cacheCompression: false,
                            plugins: [
                                // "@babel/plugin-transform-runtime", // presets中包含了
                                "react-refresh/babel", // 开启js的HMR功能
                            ],
                        },
                    },
                    {
                        test: /\.(tsx|ts)$/,
                        include: path.resolve(__dirname, "../client/src"),
                        use: ["ts-loader"],
                        exclude: path.resolve(__dirname, "../node_modules"),
                    },
                ],
            },

        ],
    },
    // 插件
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, "../client/public/index.html"),
        }),
        new ReactRefreshWebpackPlugin(), // 解决js的HMR功能运行时全局变量的问题
        // 将public下面的资源复制到dist目录去（除了index.html）
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "../client/public"),
                    to: path.resolve(__dirname, "../www"),
                    toType: "dir",
                    noErrorOnMissing: true, // 不生成错误
                    globOptions: {
                        // 忽略文件
                        ignore: ["**/index.html"],
                    },
                    info: {
                        // 跳过terser压缩js
                        minimized: true,
                    },
                },
            ],
        }),
        new ESLintWebpackPlugin({
            context: path.resolve(__dirname, "../client/src"),
            exclude: path.resolve(__dirname, "../node_modules"),
            cache: true,
            cacheLocation: path.resolve(
                __dirname,
                "../node_modules/.cache/.eslintcache"
            ),
        }),
    ],
    optimization: {
        splitChunks: {
            chunks: "all",
        },
        runtimeChunk: {
            name: (entrypoint) => `runtime~${entrypoint.name}`,
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../client/src'),
        },
        extensions: [".jsx", ".tsx", ".ts", ".js", ".json"], // 自动补全文件扩展名，让jsx可以使用
    },
    devServer: {
        open: true,
        host: "localhost",
        port: 3000,
        hot: true,
        compress: true,
        historyApiFallback: {
            rewrites: [
                { from: /\.*/, to: '/pro/index.html' },
            ]
        },
        proxy: [
            {
                context: ['/hexopro/api'],
                target: 'http://localhost:4000',
                timeout: 10000,
                pathRewrite: {
                    '/hexopro/api': '/hexopro/api'
                },
                changeOrigin: true,
                secure: false

            },
            {
                context: ['/images/'],

                target: 'http://localhost:4000',
                timeout: 10000,
                pathRewrite: {
                    '/images/': '/images/'
                },
                changeOrigin: true,
                secure: false

            }
        ]
    },
    // 模式
    mode: "development",
    devtool: "cheap-module-source-map",
}
