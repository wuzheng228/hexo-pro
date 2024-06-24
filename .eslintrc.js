// 例如在React项目中，我们可以这样写配置
module.exports = {
    env: { //定义执行在哪些环境
        "browser": true,//告诉eslint 执行环境是包含 浏览器的，否则一些 window 等变量会报错，认为没有定义过
        "es6": true,
        "node": true
    },
    parser: "@typescript-eslint/parser",
    extends: [
        "prettier",
        "plugin:@typescript-eslint/recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended"
    ],
    parserOptions: {
        ecmaFeatures: {
            experimentalObjectRestSpread: true,
            jsx: true
        },
        sourceType: "module",

    },
    plugins: ["react", "babel", "@typescript-eslint/eslint-plugin"],
    "settings": {
        "react": {
            "version": "18.3.1"
        }
    },
    rules: {
        // 我们的规则会覆盖掉react-app的规则
        // 所以想要修改规则直接改就是了
        eqeqeq: ["warn", "smart"],
        semi: [2, "never"], // 禁用分号, // 禁用分号
        "no-var": 2, // 不能使用 var 定义变量
    },
}
