# 支持的Hexo版本
Hexo pro 插件支持 Hexo 3.x
# 截图
![posts view](docs/login-page.png?raw=true)
![posts view](docs/home-page.png?raw=true)
![posts view](docs/editor-page.png?raw=true)
# 快速开始
## 1.设置Hexo&创建博客
```sh
npm install -g hexo
cd ~/
hexo init my-blog
cd my-blog
npm install
```
## 2.安装Hexo pro

```sh
npm install --save hexo-pro
hexo server -d
open http://localhost:4000/pro/
```
## 3.配置登陆账户与密码
需要在hexo的_config.yml中增加以下配置来使用账户密码登陆后台，不配置后台会直接登陆。
配置后使用jwt来保护后台访问的接口
```yml
hexo_pro:
  username: admim
  password: 123
  avatar: https: image for your own avata
```
