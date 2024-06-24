// webpack.dev.js
const path = require("path")
const ESLintWebpackPlugin = require("eslint-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const CopyPlugin = require("copy-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const TerserWebpackPlugin = require("terser-webpack-plugin")
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin")
// const ImageMinimizerPlugin = require("image-minimizer-webpack-plugin")

const getStyleLoaders = (preProcessor) => {
    console.log(path.resolve(__dirname, "../client/src"))
    return [
        MiniCssExtractPlugin.loader,
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
        path: path.resolve(__dirname, '../www'),
        filename: 'static/js/[name][contenthash:10].js',
        chunkFilename: 'static/js/[name][contenthash:10].chunk.js',
        assetModuleFilename: 'static/media/[hash:10][ext][query]',
        clean: true
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
                    },
                    {
                        test: /\.less$/,
                        use: getStyleLoaders("less-loader"),
                    },
                    {
                        test: /\.s[ac]ss$/,
                        use: getStyleLoaders("sass-loader"),
                    },
                    {
                        test: /\.styl$/,
                        use: getStyleLoaders("stylus-loader"),
                    },
                    {
                        test: /\.(png|jpe?g|gif|svg)$/,
                        type: "asset",
                        parser: {
                            dataUrlCondition: {
                                maxSize: 10 * 1024, // 小于10kb的图片会被base64处理
                            },
                        },
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
                        test: /\.(tsx|js)$/,
                        include: path.resolve(__dirname, "../client/src"),
                        loader: "babel-loader",
                        options: {
                            cacheDirectory: true,
                            cacheCompression: false,
                            plugins: [
                                // "@babel/plugin-transform-runtime", // presets中包含了
                                // "react-refresh/babel", // 开启js的HMR功能
                            ],
                        },
                    },
                    {
                        test: /\.(tsx)$/,
                        include: path.resolve(__dirname, "../client/src"),
                        use: ["ts-loader"],
                        exclude: /node_modules/,
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
        // 将public下面的资源复制到dist目录去（除了index.html）
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "../client/public"),
                    to: path.resolve(__dirname, "../dist"),
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
            exclude: "node_modules",
            cache: true,
            cacheLocation: path.resolve(
                __dirname,
                "../node_modules/.cache/.eslintcache"
            ),
        }),
        new MiniCssExtractPlugin(
            {
                filename: "static/css/[name].[contenthash:10].css",
                chunkFilename: "static/css/[name].[contenthash:10].chunk.css"
            }
        )
    ],
    optimization: {
        splitChunks: {
            chunks: "all",
        },
        runtimeChunk: {
            name: (entrypoint) => `runtime~${entrypoint.name}`,
        },
        minimizer: [new CssMinimizerPlugin(), new TerserWebpackPlugin()]
    },
    resolve: {
        extensions: [".jsx", ".tsx", ".js", ".json"], // 自动补全文件扩展名，让jsx可以使用
    },
    // 模式
    mode: "production",
    devtool: "source-map",
}
