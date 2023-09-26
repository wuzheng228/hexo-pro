# Hexo pro
> slogen：Hexo pro 一个属于你自己的博客后台
>

做这个项目的原因是自己搭建的[个人博客](https://www.wzfry.com/)用的是Hexo框架，Hexo-admin插件已经很久没有人维护了，随着博客量的不断增加一些使用体验方面不大好,不支持front-matter的修改，应此萌生了自己做一个Hexo博客后台的想法。
一开始是想用SpringBoot或者Go Hertz等后台框架来搭建后台服务，nginx托管静态文件，后台服务维护markdown文件，通过hexo命令行渲染更新静态文件，但是想了想这样做反而更复杂了，也看过github上开源的Hexo博客管理系统比如Qexo，感觉部署起来有点麻烦，还是直接装hexo插件来的方便，不会引入更多的东西。

我之前学的基本上都是后端，前端属于入门的水平，如果有大佬对这个项目感兴趣欢迎一起来贡献，目前这个版本能满足日常编写发布博客的需求，后续会慢慢迭代
走过路过的朋友、个人博客爱好者点个star支持下吧 thanks~~

# 支持的Hexo版本
Hexo pro 插件支持 Hexo 3.x
# 截图
![posts view](docs/login-page.png?raw=true)
![posts view](docs/home-page.png?raw=true)
![posts view](docs/editor-page.png?raw=true)
# 特性
- 支持创建编写博客
- 支持创建编写页面
- 支持图片粘贴上传
- 支持post、page的front-matter编辑

这个插件其实是采用前后端分离的方式编写的，这个插件在hexo的server当中添加了中间件，其实是作为后端，代理前端打包的静态文件，静态文件存放在www文件夹当中。
客户端的代码请看另外一个仓库: https://github.com/wuzheng228/hexo-pro-client
ps：这里你可能会问，为什么不把客户端和后端的代码放在同一个仓库当中，因为hexo-pro-client使用了Arco-design pro 作为脚手架放在多级文件夹当中启动dev server会有问题
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
  secret: xxx // jwt secret key
```
# 贡献
- 如果你有问题或者相关的建议可以在issues当中向我提出修改意见
- 目前只是支持了最基本的博客编辑能力，如果你想让hexo-pro支持更多的功能请一起来建设