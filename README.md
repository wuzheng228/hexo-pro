# Hexo Pro

**![GitHub license](https://img.shields.io/github/license/wuzheng228/hexo-pro)**

!**Version**

> 现代化 Hexo 博客后台管理系统，助力高效内容创作与管理

---

## 🏆 项目简介

Hexo Pro 是专为 **Hexo** 静态博客框架打造的后台管理系统插件，旨在为博客作者和开发者提供更强大、更便捷的内容管理体验。

项目愿景/定位：

Hexo Pro为Hexo用户提供专业级内容管理体验，节省您90%的内容维护时间！

相关项目：* **Hexo Pro Client** - Hexo Pro 的前端实现，基于 React 开发的现代化管理界面

* **Hexo Pro Desktop** - 基于 Electron 的桌面客户端，支持多项目管理与本地增强体验

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

**├── hexo-pro/           # 本插件（后端核心）**

**└── hexo-pro-desktop/   # 桌面客户端（Electron）**

* hexo-pro-client：现代化 Web 管理界面
* hexo-pro：Hexo 插件，提供 API 和服务端逻辑
* hexo-pro-desktop：桌面客户端，集成 hexo-pro-core，支持多项目与本地增强体验

---

## 🚀 快速开始

### 1. 作为 Hexo 插件使用

#### 前置要求

* Node.js 16+
* Hexo 7.x

#### 安装步骤

bash

Apply to README.md

Run

**# 1. 安装 Hexo Pro 插件**

**npm **install** **--save** **hexo-pro

**# 2. 启动 Hexo 服务器**

**hexo **server** **-d

**# 3. 访问后台管理页面**

**open **http://localhost:4000/pro/

### 2. 使用桌面客户端（推荐）

#### 系统要求

* Windows 10+ / macOS 10.14+ / Ubuntu 18.04+
* Node.js 16+

#### 安装与启动

直接下载 **Releases** 预构建版本。

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

如果本项目对您有帮助，欢迎：

⭐ 给个Star支持

📢 分享给更多Hexo用户

💬 提出宝贵建议

您的支持会让Hexo生态更强大！
