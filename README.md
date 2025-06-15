# Hexo Pro

[![GitHub license](https://img.shields.io/github/license/wuzheng228/hexo-pro)](https://github.com/wuzheng228/hexo-pro/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-blue)](https://github.com/wuzheng228/hexo-pro/releases)
[![npm downloads](https://img.shields.io/npm/dm/hexo-pro)](https://www.npmjs.com/package/hexo-pro)
[![GitHub stars](https://img.shields.io/github/stars/wuzheng228/hexo-pro)](https://github.com/wuzheng228/hexo-pro/stargazers)

> 现代化 Hexo 博客后台管理系统，助力高效内容创作与管理

---

## 🏆 项目简介

Hexo Pro 是专为 **Hexo** 静态博客框架打造的后台管理系统插件，旨在为博客作者和开发者提供更强大、更便捷的内容管理体验。

项目愿景/定位：

Hexo Pro为Hexo用户提供专业级内容管理体验，节省您90%的内容维护时间！

相关项目：
- [Hexo Pro Client](https://github.com/wuzheng228/hexo-pro-client) - Hexo Pro 的前端实现，基于 React 开发的现代化管理界面
- [Hexo Pro Desktop](https://github.com/wuzheng228/hexo-pro-desktop) - 基于 Electron 的桌面客户端，支持多项目管理与本地增强体验

---

## ✨ 核心优势

* 🚀 极致易用：界面友好，操作直观，零学习成本上手
* 🌗 多主题支持：一键切换暗黑/明亮模式，适配不同使用场景
* 📱 移动端适配：响应式设计，手机、平板、PC 全面支持
* 🔒 安全可靠：支持多用户权限管理，数据安全有保障
* ⚡ 高效集成：与 Hexo 生态无缝对接，支持主流插件与主题
* 🖥️ 桌面端增强：支持多项目切换、智能认证、原生菜单、离线管理等桌面专属功能

---

## 🎯 功能亮点

* 文章管理：创建、编辑、删除文章，支持 Front-matter 可视化编辑
* 页面管理：轻松管理静态页面
* 图床集成：支持图片粘贴上传与批量管理
* 配置管理：可视化编辑 Hexo 配置文件
* 全局搜索：基于 Fuse.js 的极速全文检索
* 一键部署：多种部署方式，轻松上线
* 国际化支持：多语言界面，全球用户友好
* 桌面端专属：多项目管理、自动认证、原生菜单、离线支持、智能端口管理等
* 更多功能：……

---

## 📦 子项目结构

本项目包含以下子模块：

```
parent-directory/
├── hexo-pro/           # 本插件（后端核心）
├── hexo-pro-client/    # 前端管理界面（React）
└── hexo-pro-desktop/   # 桌面客户端（Electron）
```

* **hexo-pro**：Hexo 插件，提供 API 和服务端逻辑
* **hexo-pro-client**：现代化 Web 管理界面
* **hexo-pro-desktop**：桌面客户端，集成 hexo-pro-core，支持多项目与本地增强体验

---

## 🚀 快速开始

### 1. 作为 Hexo 插件使用

#### 前置要求

* Node.js 16+
* Hexo 7.x

#### 安装步骤

```bash
# 1. 安装 Hexo Pro 插件
npm install --save hexo-pro

# 2. 启动 Hexo 服务器
hexo server -d

# 3. 访问后台管理页面
open http://localhost:4000/pro/
```

### 2. 使用桌面客户端

#### 系统要求

* Windows 10+ / macOS 10.14+ / Ubuntu 18.04+
* Node.js 16+

#### 安装与启动

直接下载 **[Releases](https://github.com/wuzheng228/hexo-pro/releases)** 预构建版本。

#### 使用说明

* 首次启动选择 Hexo 博客项目目录，自动启动 Hexo Pro 服务
* 支持多项目切换、自动认证、原生菜单、快捷键等桌面增强体验
* 详细功能见 **桌面端 README**

---

## 📸 界面预览

<div align="center">

**登录页** | **文章列表** | **编辑器**
:---: | :---: | :---:
<img src="docs/login-page.png" width="250"> | <img src="docs/posts-page.png" width="250"> | <img src="docs/editor-page.png" width="250">

**主页** | **图床管理** | **配置管理**
:---: | :---: | :---:
<img src="docs/home-page.png" width="250"> | <img src="docs/image-manager-page.png" width="250"> | <img src="docs/config-manager-page.png" width="250">

**全局搜索** | **部署**
:---: | :---:
<img src="docs/global-search-page.png" width="250"> | <img src="docs/deploy-page.png" width="250">

</div>

---

## 📅 更新日志

* 2025-01-XX v2.0.0

✅ **🔧 FrontMatter 布尔值修复** - 修复了 frontMatter 中布尔值的展示和设置问题，确保正确处理 true/false 值

✅ **🔌 智能插件加载** - 桌面端优化插件加载逻辑，可自动加载已有项目下 node_modules 中所有可用的 Hexo 插件

✅ **🌐 灵活链接跳转** - 桌面端跳转链接默认指向 localhost:4000，支持通过设置自定义配置目标地址

✅ **✏️ 编辑器默认模式** - 新增编辑器默认模式配置，可根据个人喜好设置编辑器的默认工作模式

✅ **🖼️ 封面隐藏控制** - 新增封面隐藏设置选项，开启后可以隐藏文章封面图片显示

✅ **⚡ 快速部署模式** - 新增部署跳过静态文件生成配置，开启后可直接推送到仓库，提升部署效率

* 2025-06-07 v1.3.0

✅ 新增桌面端（hexo-pro-desktop）子项目，支持多项目管理与本地增强体验

✅ 优化核心 API 结构，提升桌面端与 Web 端协同体验

* 2025-05-10 v1.2.0

✅ 新增图床管理功能

✅ 新增yaml配置管理

✅ 新增设置和主页功能

* 2024-08-29 v1.1.16

🔧 优化编辑器体验

🌗 改进暗黑模式

🔍 增强全局搜索功能

---

## 🤝 参与贡献

欢迎通过以下方式参与项目：

* 提交 Issues 报告问题或建议
* 提交 Pull Request 贡献代码
* 加入 QQ 群交流：1009585669

<img src="docs/qq-group.png" width="150">

---

## 📄 许可证

MIT © wuzheng

---

## ☕️ 打赏支持

如果你觉得本项目不错，可以请我喝杯咖啡☕️，支持项目持续优化！

<img src="docs/donate_alipay.jpg" width="150" alt="打赏二维码">
<img src="docs/donate_wc.jpg" width="150" alt="打赏二维码">

---

## 🙏 感谢捐助者

感谢以下用户对项目的支持,排名不分先后，您的捐助是我们持续开发的动力！

<div align="center">

<table>
<tr>
<td align="center">
<img src="docs/sponsors/sponsor_vk.jpg" width="60" height="60" style="border-radius: 50%;" alt="捐助者头像"><br>
<sub><b>v快</b></sub>
</td>
<td align="center">
<img src="docs/sponsors/sponsor_empty.jpg" width="60" height="60" style="border-radius: 50%;" alt="捐助者头像"><br>
<sub><b>💝 神秘支持者</b></sub>
</td>
<td align="center">
<img src="docs/sponsors/sponsor_crosery.png" width="60" height="60" style="border-radius: 50%;" alt="捐助者头像"><br>
<sub><b>Crosery</b></sub>
</td>
</table>

</div>

> 💝 想成为捐助者？扫描上方二维码支持项目，并联系我们添加您的头像！

---

如果本项目对您有帮助，欢迎：

⭐ 给个Star支持

📢 分享给更多Hexo用户

💬 提出宝贵建议

您的支持会让Hexo生态更强大！

## 📦 技术栈
- **后端**：Node.js + Express
- **数据库**：NeDB (嵌入式数据库)
- **前端**：React (hexo-pro-client)
- **桌面端**：Electron (hexo-pro-desktop)
- **核心依赖**：Hexo 7.x, Fuse.js, Multer 等
