# 阿飞日记 · 一个完整的个人博客

纯静态、零依赖、零构建：HTML + CSS + 原生 JavaScript，双击 `index.html` 就能用，
也可以直接丢到 GitHub Pages / Netlify / Vercel / 任意静态服务器。

> 线上地址：**https://freedomly1.github.io/blog/**
> 仓库：https://github.com/Freedomly1/blog

> 当前站点信息：**阿飞日记 / AFEI DIARY**，作者 **阿飞**（前端工程师 / 界面设计爱好者），
> 建站 2026 年，联系邮箱 `3940933187@qq.com`。
>
> 站内 23 篇文章：其中 12 篇是「编程教程」——C/C++、Python、AI 三条学习线各 4 篇，
> 每篇对应一本参考书和可运行的代码；另外 11 篇是随笔与技术复盘。
> `SITE.github` 留空，关于页会自动隐藏 GitHub 入口。
>
> 引文只取一两句用于评论，正文批注为原创；除标注「大意自译」外均引自中文通行译本。

## 目录

```
blog/
├─ index.html          页面骨架 + 全部文章的 Markdown 正文
├─ assets/
│  ├─ style.css        全部样式（亮 / 暗双主题、响应式）
│  ├─ posts.js         站点配置、分类、每篇文章的元数据
│  └─ app.js           路由、Markdown 渲染、搜索、评论、收藏……
├─ feed.xml            RSS 2.0 订阅源
├─ preview/            截图（home.png / post.png / books.png）
└─ README.md           本文件
```

## 打开方式

- **直接看**：双击 `blog/index.html`。
- **起个本地服务**（推荐，剪贴板 API 需要 http 环境才可用）：

```bash
python -m http.server 8080 --directory blog
# 打开 http://localhost:8080
```

> 没有网络也能完整使用：不加载任何 CDN、外部字体或第三方脚本。

## 已经实现的功能

**内容与导航**

- 首页：大标题、站点统计、精选文章、最新文章、书架摘录、分类入口、「现在」清单
- 文章列表（每页 6 篇，带分页）、分类筛选、标签云、按年份归档
- **书架**（`#/books`）：按领域筛选的书籍墙，封面、评分、一句话短评、摘录段数，
  可跳转到对应书摘；书摘文章页顶部有书籍信息条
- 文章详情：目录（TOC，滚动自动高亮）、阅读进度条、上一篇 / 下一篇、相关文章
- 关于页：作者卡片、/now 清单、站点信息、写作原则、联系方式
- 自定义 404、「我的收藏」聚合页

**阅读体验**

- Markdown 渲染：标题、粗体 / 斜体 / 删除线、行内代码、代码块（带语言标签与一键复制）、
  引用、有序 / 无序 / 嵌套列表、表格、分隔线、图片、链接
- 自动估算字数与阅读时长
- 亮 / 暗双主题：跟随系统、可手动切换、记忆选择、无闪烁
- 响应式：1000 / 760 / 480 三档断点，手机端抽屉菜单
- 尊重 `prefers-reduced-motion`，支持打印样式

**交互**

- 全站搜索：`/` 唤起、实时匹配标题/标签/分类/正文、关键词高亮、↑↓ 选择 + Enter 打开
- 评论：昵称 + 正文，支持回复、删除，Ctrl + Enter 提交，数据存 localStorage
- 点赞、收藏（收藏会出现在首页与独立页面）
- 复制文章链接、复制邮箱、代码块复制
- 回到顶部、Esc 关闭弹层、跳到主要内容（无障碍）

**数据说明**：主题、点赞、收藏、评论全部存在浏览器 `localStorage`（键名前缀 `moonstars:`，历史遗留，仅本机可见），
不上传、不统计、换设备不同步。清除站点数据会一并清空。

## 怎么加一篇新文章

两步：

1. **在 `assets/posts.js` 的 `BLOG_POSTS` 数组里加一条元数据**：

```js
{
  slug: 'my-new-post',              // 唯一 id，也是地址 #/post/my-new-post
  title: '文章标题',
  excerpt: '一句话摘要，会出现在卡片和列表里',
  date: '2026-12-01',               // YYYY-MM-DD，自动按时间排序
  category: '前端工程',              // 必须是 BLOG_CATEGORIES 里的某个键
  tags: ['标签一', '标签二'],
  c1: '#0f5f5c', c2: '#6fc3b4',     // 封面的渐变起止色
  featured: true,                   // 可选：设为首页精选（只取第一篇）
  book: {                           // 可选：书摘文章才有，填了就会自动进「书架」
    title: '书名', author: '作者', year: '1993',
    field: '文学',                  // 领域，书架按它筛选
    rating: 5,                      // 1–5 星
    note: '一句话短评'               // 书架卡片上的一句话
  }
}
```

2. **在 `index.html` 底部加一段 Markdown**，`id` 必须是 `md-` + slug：

```html
<script type="text/markdown" id="md-my-new-post">
正文第一段。

## 小标题

- 列表项
- 列表项

> 引用

（代码块照常用三个反引号包住，并在后面写上语言名，例如 css / js / bash）
</script>
```

新增分类：在 `BLOG_CATEGORIES` 里加一项 `{ desc, c1, c2 }` 即可，导航和筛选会自动更新。

书摘的写法：`> 引文` 之后空一行，再写 `> —— 书名`，出处会自动排成小字（见 `.prose blockquote p + p`）。
`#/books` 书架页、首页的书架区块、文章页的书籍信息条、摘录段数都会根据 `book` 字段自动生成，不需要额外维护。

## 改成你自己的

| 想改什么 | 改哪里 |
| --- | --- |
| 站名、英文小字、副标题、简介、作者、邮箱 | `assets/posts.js` 顶部的 `BLOG_SITE`（`github` 留空即隐藏 GitHub 入口） |
| 主色 / 配色 | `assets/style.css` 里的 `[data-theme="light"]` 与 `[data-theme="dark"]` 变量 |
| 首页大标题 | `assets/app.js` → `viewHome()` 里的 `hero-title` |
| 关于页的「现在」「原则」 | `posts.js` 的 `SITE.now`、`app.js` → `viewAbout()` 的 `principles` |
| 每页文章数 | `app.js` 里的 `var PER_PAGE = 6` |
| RSS | 手动维护 `feed.xml`（域名已是 `https://freedomly1.github.io/blog/`，`guid` 前缀 `afei-`） |

## 部署

| 平台 | 做法 |
| --- | --- |
| GitHub Pages | 已推到 `github.com/Freedomly1/blog` 根目录；Pages 开启后地址为 https://freedomly1.github.io/blog/ |
| Netlify | 把 `blog` 文件夹拖到 app.netlify.com/drop |
| Vercel / Cloudflare Pages | 新建项目，输出目录填 `blog`，构建命令留空 |
| 自己的服务器 | 把文件丢进任意静态目录即可 |

> 因为用的是 hash 路由（`#/post/xxx`），不需要配置任何服务端重写规则，
> 刷新任意页面都不会 404。

## 兼容性

Chrome / Edge / Safari / Firefox 近两年的版本均可。
用到了容器查询、`color-mix()`、`text-wrap: pretty` 等较新的 CSS，
在旧浏览器上会退化为稍朴素但可用的样式。
