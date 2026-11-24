/* =========================================================
   阿飞观察站 · 应用逻辑
   无依赖、无构建：路由 / Markdown / 搜索 / 评论 / 收藏
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  var store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem('moonstars:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('moonstars:' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  var SITE = window.BLOG_SITE || {};
  var CATS = window.BLOG_CATEGORIES || {};

  /* ---------------- 数据整理 ---------------- */
  function parseDate(str) {
    var p = String(str).split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }

  var posts = (window.BLOG_POSTS || []).map(function (p) {
    var el = document.getElementById('md-' + p.slug);
    var md = el ? el.textContent.trim() : '';
    var plain = md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*`|\-]+/g, ' ')
      .replace(/\s+/g, '');
    return {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      date: p.date,
      dateObj: parseDate(p.date),
      category: p.category,
      level: p.level || '',
      tags: p.tags || [],
      c1: p.c1,
      c2: p.c2,
      cover: p.cover || '',
      bookCover: p.bookCover || '',
      featured: !!p.featured,
      book: p.book || null,
      markdown: md,
      quotes: (md.match(/^> (?!——)/gm) || []).length,
      chars: plain.length,
      minutes: Math.max(1, Math.round(plain.length / 330))
    };
  }).sort(function (a, b) { return b.dateObj - a.dateObj; });

  posts.forEach(function (p, i) { p.no = i + 1; });

  var bySlug = {};
  posts.forEach(function (p) { bySlug[p.slug] = p; });

  var catList = Object.keys(CATS).filter(function (name) {
    return posts.some(function (p) { return p.category === name; });
  }).map(function (name) {
    return { name: name, desc: (CATS[name] || {}).desc || '', c1: (CATS[name] || {}).c1, c2: (CATS[name] || {}).c2, count: posts.filter(function (p) { return p.category === name; }).length };
  });

  var tagMap = {};
  posts.forEach(function (p) {
    p.tags.forEach(function (t) { tagMap[t] = (tagMap[t] || 0) + 1; });
  });
  var tagList = Object.keys(tagMap).map(function (t) { return { name: t, count: tagMap[t] }; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'zh'); });

  var totalChars = posts.reduce(function (n, p) { return n + p.chars; }, 0);

  /* 书架：从文章里反推出书籍列表 */
  var bookPosts = posts.filter(function (p) { return p.book; });
  var bookFields = [];
  bookPosts.forEach(function (p) {
    if (bookFields.indexOf(p.book.field) < 0) bookFields.push(p.book.field);
  });

  /* ---------------- Markdown ---------------- */
  function inline(text) {
    var codes = [];
    var s = String(text).replace(/`([^`]+)`/g, function (m, c) {
      codes.push(c);
      return '\u0001' + (codes.length - 1) + '\u0001';
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
      return '<img src="' + src + '" alt="' + alt + '" loading="lazy">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      var ext = /^https?:/i.test(href);
      return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\u0001(\d+)\u0001/g, function (m, n) { return '<code>' + esc(codes[+n]) + '</code>'; });
    return s;
  }

  function splitRow(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }

  function isTableSep(line) {
    return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.indexOf('-') > -1;
  }

  function codeBlock(b) {
    var lang = (b.lang || '').toLowerCase();
    var label = lang || 'code';
    return '<div class="code-block" data-lang="' + esc(label) + '">' +
      '<div class="cb-head"><span class="cb-dots"><i></i><i></i><i></i></span>' +
      '<span>' + esc(label) + '</span>' +
      '<button class="cb-copy" data-action="copy-code" type="button">复制</button></div>' +
      '<pre><code>' + esc(b.code) + '</code></pre></div>';
  }

  function renderBlocks(lines) {
    var out = [];
    var i = 0;
    var n = lines.length;

    while (i < n) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      /* 代码块占位 */
      var cm = line.match(/^\u0000CODE(\d+)\u0000$/);
      if (cm) { out.push(codeBlock(CODE_BLOCKS[+cm[1]])); i++; continue; }

      /* 分割线 */
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      /* 标题 */
      var hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        var lv = Math.min(hm[1].length, 4);
        out.push('<h' + lv + '>' + inline(hm[2].trim()) + '</h' + lv + '>');
        i++;
        continue;
      }

      /* 引用 */
      if (/^\s*>/.test(line)) {
        var q = [];
        while (i < n && /^\s*>/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderBlocks(q) + '</blockquote>');
        continue;
      }

      /* 表格 */
      if (line.indexOf('|') > -1 && i + 1 < n && isTableSep(lines[i + 1])) {
        var head = splitRow(line);
        var al = splitRow(lines[i + 1]).map(function (c) {
          if (/^:-+:$/.test(c)) return 'center';
          if (/-+:$/.test(c)) return 'right';
          if (/^:-+/.test(c)) return 'left';
          return '';
        });
        i += 2;
        var body = [];
        while (i < n && lines[i].indexOf('|') > -1 && !/^\s*$/.test(lines[i])) {
          body.push(splitRow(lines[i]));
          i++;
        }
        var html = '<div class="table-wrap"><table><thead><tr>';
        head.forEach(function (h, idx) {
          html += '<th' + (al[idx] ? ' style="text-align:' + al[idx] + '"' : '') + '>' + inline(h) + '</th>';
        });
        html += '</tr></thead><tbody>';
        body.forEach(function (row) {
          html += '<tr>';
          head.forEach(function (_, idx) {
            html += '<td' + (al[idx] ? ' style="text-align:' + al[idx] + '"' : '') + '>' + inline(row[idx] || '') + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        out.push(html);
        continue;
      }

      /* 列表 */
      var li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        var items = [];
        while (i < n) {
          var m2 = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (!m2) break;
          items.push({ indent: m2[1].replace(/\t/g, '  ').length, type: /\d/.test(m2[2]) ? 'ol' : 'ul', text: m2[3] });
          i++;
        }
        out.push(buildList(items, 0, items[0].indent).html);
        continue;
      }

      /* 段落 */
      var para = [];
      while (i < n) {
        var cur = lines[i];
        if (/^\s*$/.test(cur)) break;
        if (/^#{1,6}\s/.test(cur)) break;
        if (/^\s*>/.test(cur)) break;
        if (/^\s*([-*+]|\d+[.)])\s+/.test(cur)) break;
        if (/^\u0000CODE\d+\u0000$/.test(cur)) break;
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(cur)) break;
        if (cur.indexOf('|') > -1 && i + 1 < n && isTableSep(lines[i + 1])) break;
        para.push(cur.trim());
        i++;
      }
      if (para.length) out.push('<p>' + inline(joinLines(para)) + '</p>');
    }
    return out.join('\n');
  }

  function joinLines(arr) {
    if (arr.length === 1) return arr[0];
    var out = arr[0];
    for (var k = 1; k < arr.length; k++) {
      var a = out.slice(-1), b = arr[k].charAt(0);
      var cjk = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/;
      out += (cjk.test(a) || cjk.test(b)) ? arr[k] : ' ' + arr[k];
    }
    return out;
  }

  function buildList(items, pos, indent) {
    var type = items[pos].type;
    var html = '<' + type + '>';
    while (pos < items.length && items[pos].indent === indent) {
      var text = inline(items[pos].text);
      pos++;
      if (pos < items.length && items[pos].indent > indent) {
        var sub = buildList(items, pos, items[pos].indent);
        text += sub.html;
        pos = sub.pos;
      }
      html += '<li>' + text + '</li>';
    }
    html += '</' + type + '>';
    return { html: html, pos: pos };
  }

  var CODE_BLOCKS = [];
  function mdToHtml(src) {
    CODE_BLOCKS = [];
    var body = String(src).replace(/```([\w+#.-]*)[ \t]*\n([\s\S]*?)```/g, function (m, lang, code) {
      CODE_BLOCKS.push({ lang: lang, code: code.replace(/\n$/, '') });
      return '\n\u0000CODE' + (CODE_BLOCKS.length - 1) + '\u0000\n';
    });
    return renderBlocks(body.split('\n'));
  }

  /* ---------------- 日期与文案 ---------------- */
  function fmtDate(d) { return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'; }
  function fmtShort(d) { return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'; }
  function fmtMono(d) { return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function relTime(ts) {
    var diff = (Date.now() - ts) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - ys) / 86400000) + 1) / 7);
  }

  /* ---------------- 链接 ---------------- */
  function postHref(p) { return '#/post/' + encodeURIComponent(p.slug); }
  function catHref(c) { return '#/category/' + encodeURIComponent(c); }
  function tagHref(t) { return '#/tag/' + encodeURIComponent(t); }

  /* ---------------- 通用片段 ---------------- */
  function lvKey(lv) {
    return lv === '基础' ? 'basic' : (lv === '进阶' ? 'mid' : 'pro');
  }

  function cover(p, extraClass) {
    // p.cover 有值时用图片封面，否则退回纯 CSS 渐变（老数据不受影响）
    var cls = 'cover ' + (extraClass || '') + (p.cover ? ' has-img' : '');
    var style = '--c1:' + p.c1 + ';--c2:' + p.c2 + (p.cover ? ';background-image:url(\'' + p.cover + '\')' : '');
    return '<div class="' + cls + '" style="' + style + '">' +
      '<span class="cover-cat">' + esc(p.category) + '</span>' +
      '<span class="cover-orb" aria-hidden="true"></span>' +
      '<span class="cover-no">No.' + pad(p.no) + '</span>' +
      '</div>';
  }

  function stars(n) {
    var full = Math.max(0, Math.min(5, Math.round(n || 0)));
    var out = '';
    for (var i = 0; i < 5; i++) out += i < full ? '★' : '☆';
    return out;
  }

  /* 书架卡片 */
  function bookCard(p, i) {
    var b = p.book;
    return '<a class="book-card" href="' + postHref(p) + '" style="--delay:' + (i || 0) + '">' +
      '<span class="book-cover' + (p.bookCover ? ' has-img' : '') + '" style="--c1:' + p.c1 + ';--c2:' + p.c2 + (p.bookCover ? ';background-image:url(\'' + p.bookCover + '\')' : '') + '">' +
      '<span class="bc-spine"></span>' +
      '<span class="bc-title">' + esc(b.title) + '</span>' +
      '<span class="bc-author">' + esc(b.author) + '</span>' +
      '<span class="bc-fieldmark">' + esc(b.field) + '</span>' +
      '</span>' +
      '<span class="book-info">' +
      '<strong class="bc-name">' + esc(b.title) + '</strong>' +
      '<span class="bc-sub">' + esc(b.author) + ' · ' + esc(b.year) + '</span>' +
      '<span class="bc-row"><span class="stars">' + stars(b.rating) + '</span><span class="bc-field">' + esc(b.field) + '</span>' + (p.level ? '<span class="bc-lv">' + esc(p.level) + '</span>' : '') + '</span>' +
      '<span class="bc-note">' + esc(b.note) + '</span>' +
      '<span class="bc-link">阅读全文 →</span>' +
      '</span></a>';
  }

  /* 文章页顶部的书籍信息条 */
  function bookStrip(p) {
    if (!p.book) return '';
    var b = p.book;
    return '<a class="book-strip" href="#/books">' +
      '<span class="bs-cover" style="--c1:' + p.c1 + ';--c2:' + p.c2 + '">' + esc(b.title.charAt(0)) + '</span>' +
      '<span class="bs-text"><strong>《' + esc(b.title) + '》</strong>' +
      '<span>' + esc(b.author) + ' · ' + esc(b.year) + ' · ' + esc(b.field) + '</span></span>' +
      '<span class="bs-stars" aria-label="' + b.rating + ' 星">' + stars(b.rating) + '</span>' +
      '<span class="bs-link">书架 →</span></a>';
  }

  function tagsHtml(p, link) {
    return p.tags.map(function (t) {
      return link === false
        ? '<span class="tag">' + esc(t) + '</span>'
        : '<a class="tag" href="' + tagHref(t) + '">' + esc(t) + '</a>';
    }).join('');
  }

  function postCard(p) {
    return '<article class="post-card">' +
      '<a class="card-link" href="' + postHref(p) + '">' +
      cover(p) +
      '<div class="card-body">' +
      '<div class="card-meta"><span>' + esc(p.category) + '</span><span class="sep">/</span><span>' + fmtShort(p.dateObj) + '</span><span class="sep">/</span><span>' + p.minutes + ' 分钟</span></div>' +
      '<h3 class="card-title">' + esc(p.title) + '</h3>' +
      '<p class="card-excerpt">' + esc(p.excerpt) + '</p>' +
      '</div></a>' +
      '<div class="card-foot"><div class="card-tags">' + tagsHtml(p) + '</div>' +
      '<span class="tag">' + p.chars + ' 字</span></div>' +
      '</article>';
  }

  function postRow(p) {
    return '<article class="post-row">' +
      '<a class="row-cover" href="' + postHref(p) + '" aria-hidden="true" tabindex="-1">' + cover(p) + '</a>' +
      '<div class="row-body">' +
      '<a href="' + postHref(p) + '"><h3 class="row-title">' + esc(p.title) + '</h3></a>' +
      '<p class="row-excerpt">' + esc(p.excerpt) + '</p>' +
      '<div class="row-meta">' +
      '<span>' + fmtDate(p.dateObj) + '</span><span class="sep">·</span>' +
      '<a href="' + catHref(p.category) + '">' + esc(p.category) + '</a><span class="sep">·</span>' +
      '<span>' + p.minutes + ' 分钟阅读</span><span class="sep">·</span>' +
      '<span>' + p.chars + ' 字</span>' +
      '</div></div></article>';
  }

  function secHead(title, more) {
    return '<div class="sec-head"><h2>' + title + '</h2>' + (more || '') + '</div>';
  }

  /* ---------------- 视图：首页 ---------------- */
  function viewHome() {
    var featured = posts.filter(function (p) { return p.featured; })[0] || posts[0];
    var rest = posts.filter(function (p) { return p !== featured; }).slice(0, 4);
    var latest = posts[0];
    var saved = store.get('bookmarks', []).map(function (s) { return bySlug[s]; }).filter(Boolean).slice(0, 3);
    var week = isoWeek(new Date());

    var stats = [
      [posts.length, '篇文章'],
      [totalChars > 1000 ? (totalChars / 1000).toFixed(1) + 'k' : totalChars, '字'],
      [catList.length, '个分类'],
      [tagList.length, '个标签']
    ].map(function (s) {
      return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>';
    }).join('');

    return '<div class="wrap">' +

      '<section class="hero">' +
      '<p class="eyebrow"><span class="pulse"></span>写作第 ' + (new Date().getFullYear() - (SITE.since || 2026) + 1) + ' 年 · 第 ' + week + ' 周</p>' +
      '<h1 class="hero-title">本人很帅，<br><em>想搭个 AI 工作台</em>。</h1>' +
      '<p class="hero-lede">' + esc(SITE.desc) + '</p>' +
      '<div class="hero-stats">' + stats + '</div>' +
      '</section>' +

      '<section class="section" style="padding-top:34px">' +
      '<a class="feature" href="' + postHref(featured) + '">' +
      cover(featured) +
      '<div class="feature-body">' +
      '<span class="badge">精选 · ' + (featured.tags[0] || featured.category) + '</span>' +
      '<h2>' + esc(featured.title) + '</h2>' +
      '<p>' + esc(featured.excerpt) + '</p>' +
      '<div class="feature-meta"><span>' + fmtDate(featured.dateObj) + '</span><span>' + featured.minutes + ' 分钟阅读</span><span>' + featured.chars + ' 字</span></div>' +
      '<span class="read-more">阅读全文 <span aria-hidden="true">→</span></span>' +
      '</div></a>' +
      '</section>' +

      '<section class="section">' +
      secHead('最新文章', '<a class="more" href="#/posts">全部 ' + posts.length + ' 篇 →</a>') +
      '<div class="post-grid">' + rest.map(postCard).join('') + '</div>' +
      '</section>' +

      (bookPosts.length ? '<section class="section">' +
        secHead('书架上的教程', '<a class="more" href="#/books">全部 ' + bookPosts.length + ' 本 →</a>') +
        '<div class="book-grid book-grid--home">' + bookPosts.slice(0, 4).map(bookCard).join('') + '</div>' +
        '</section>' : '') +

      (saved.length ? '<section class="section">' +
        secHead('继续阅读', '<a class="more" href="#/bookmarks">我的收藏 →</a>') +
        '<div class="post-grid">' + saved.map(postCard).join('') + '</div>' +
        '</section>' : '') +

      '<section class="section">' +
      secHead('按主题浏览', '<a class="more" href="#/categories">全部分类 →</a>') +
      '<div class="cat-grid">' + catList.slice(0, 4).map(function (c) {
        return '<a class="cat-card" href="#/category/' + encodeURIComponent(c.name) + '" style="--c1:' + c.c1 + ';--c2:' + c.c2 + '">' +
          '<div class="cat-top"><span class="cat-name">' + esc(c.name) + '</span><span class="cat-count">' + pad(c.count) + '</span></div>' +
          '<p class="cat-desc">' + esc(c.desc) + '</p></a>';
      }).join('') + '</div>' +
      '</section>' +

      '<section class="section">' +
      '<div class="about-grid" style="margin-top:0">' +
      '<div class="block"><h2>关于这个博客</h2>' +
      '<p>' + esc(SITE.intro ? SITE.intro[0] : '') + '</p>' +
      '<p style="color:var(--muted);font-size:13.5px">最近更新于 ' + fmtDate(latest.dateObj) + '。全站 ' + posts.length + ' 篇文章、约 ' + (totalChars / 1000).toFixed(1) + ' 千字，纯静态构建，不加载任何第三方脚本。</p>' +
      '<p style="margin-top:16px"><a class="more" href="#/about">了解更多 →</a></p></div>' +
      '<div class="block"><h2>现在</h2><dl class="now-list">' +
      (SITE.now || []).map(function (n) { return '<div><dt>' + esc(n[0]) + '</dt><dd>' + esc(n[1]) + '</dd></div>'; }).join('') +
      '</dl></div>' +
      '</div></section>' +

      '</div>';
  }

  /* ---------------- 视图：文章列表 / 分页 ---------------- */
  var PER_PAGE = 6;

  function viewPosts(page) {
    var pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
    page = Math.min(Math.max(1, page || 1), pages);
    var slice = posts.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    var chips = '<a class="chip on" href="#/posts">全部 <b>' + pad(posts.length) + '</b></a>' +
      catList.map(function (c) {
        return '<a class="chip" href="#/category/' + encodeURIComponent(c.name) + '">' + esc(c.name) + ' <b>' + pad(c.count) + '</b></a>';
      }).join('');

    return '<div class="wrap">' +
      '<header class="page-head"><h1>全部文章</h1>' +
      '<p>按时间倒序排列。也可以从分类、标签或归档进入。</p>' +
      '<div class="chips">' + chips + '</div>' +
      '</header>' +
      '<div class="post-list">' + slice.map(postRow).join('') + '</div>' +
      pagination(page, pages) +
      '</div>';
  }

  function pagination(page, pages) {
    if (pages <= 1) return '';
    var out = '<nav class="pagination" aria-label="分页">';
    out += page > 1
      ? '<a class="page nav" href="#/posts?page=' + (page - 1) + '">← 上一页</a>'
      : '<span class="page nav disabled">← 上一页</span>';
    for (var i = 1; i <= pages; i++) {
      out += i === page
        ? '<span class="page on" aria-current="page">' + i + '</span>'
        : '<a class="page" href="#/posts?page=' + i + '">' + i + '</a>';
    }
    out += page < pages
      ? '<a class="page nav" href="#/posts?page=' + (page + 1) + '">下一页 →</a>'
      : '<span class="page nav disabled">下一页 →</span>';
    return out + '</nav>';
  }

  function viewFiltered(title, desc, list, activeCat) {
    var chips = '<a class="chip" href="#/posts">全部</a>' +
      catList.map(function (c) {
        return '<a class="chip' + (c.name === activeCat ? ' on' : '') + '" href="#/category/' + encodeURIComponent(c.name) + '">' +
          esc(c.name) + ' <b>' + pad(c.count) + '</b></a>';
      }).join('');

    return '<div class="wrap">' +
      '<header class="page-head"><h1>' + esc(title) + '</h1><p>' + esc(desc) + '</p>' +
      '<p class="count">共 ' + list.length + ' 篇 · 约 ' + (list.reduce(function (n, p) { return n + p.chars; }, 0) / 1000).toFixed(1) + ' 千字</p>' +
      '<div class="chips">' + chips + '</div></header>' +
      (list.length
        ? '<div class="post-list">' + list.map(postRow).join('') + '</div>'
        : '<div class="empty">这个分类下还没有文章。</div>') +
      '</div>';
  }

  /* ---------------- 视图：文章详情 ---------------- */
  function relatedPosts(p, n) {
    return posts.filter(function (x) { return x.slug !== p.slug; })
      .map(function (x) {
        var s = 0;
        if (x.category === p.category) s += 3;
        s += x.tags.filter(function (t) { return p.tags.indexOf(t) > -1; }).length * 2;
        return { x: x, s: s };
      })
      .sort(function (a, b) { return b.s - a.s || b.x.dateObj - a.x.dateObj; })
      .slice(0, n || 3)
      .map(function (o) { return o.x; });
  }

  function commentsBody(slug) {
    var list = store.get('comments:' + slug, []);
    if (!list.length) {
      return '<div class="empty">还没有评论。说点什么吧，哪怕只是一句「看完了」。</div>';
    }
    return '<ul class="comment-list">' + list.map(function (c) {
      var h = 0;
      for (var i = 0; i < c.name.length; i++) h = (h * 31 + c.name.charCodeAt(i)) % 360;
      return '<li class="comment">' +
        '<div class="c-avatar" style="--h:' + h + '">' + esc(c.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="c-body">' +
        '<div class="c-head"><strong>' + esc(c.name) + '</strong><time>' + relTime(c.ts) + '</time></div>' +
        '<p class="c-text">' + esc(c.text).replace(/\n/g, '<br>') + '</p>' +
        '<div class="c-actions">' +
        '<button type="button" data-action="reply" data-name="' + esc(c.name) + '">回复</button>' +
        '<button type="button" data-action="del-comment" data-slug="' + esc(slug) + '" data-cid="' + esc(c.id) + '">删除</button>' +
        '</div></div></li>';
    }).join('') + '</ul>';
  }

  function viewPost(p) {
    var idx = posts.indexOf(p);
    var prev = posts[idx - 1];
    var next = posts[idx + 1];
    var liked = store.get('liked', []).indexOf(p.slug) > -1;
    var saved = store.get('bookmarks', []).indexOf(p.slug) > -1;
    var likes = p.no * 6 + 4 + (liked ? 1 : 0);
    var comments = store.get('comments:' + p.slug, []);
    var name = store.get('commenter', '');
    var rel = relatedPosts(p, 3);

    var article = p.markdown ? mdToHtml(p.markdown) : '<p>这篇文章的正文还没有添加。</p>';

    return '<div class="wrap">' +
      '<article class="article">' +
      '<nav class="crumbs" aria-label="面包屑">' +
      '<a href="#/">首页</a><span class="sep">/</span>' +
      '<a href="' + catHref(p.category) + '">' + esc(p.category) + '</a><span class="sep">/</span>' +
      '<span class="cur">' + esc(p.title) + '</span></nav>' +

      '<header class="article-head">' +
      '<span class="kicker">' + esc(p.category) + '</span>' +
      (p.level ? '<span class="kicker lv lv-' + lvKey(p.level) + '">' + esc(p.level) + '</span>' : '') +
      '<h1 class="article-title">' + esc(p.title) + '</h1>' +
      '<p class="article-lede">' + esc(p.excerpt) + '</p>' +
      '<div class="article-meta">' +
      '<span class="dot-author"><i></i>' + esc(SITE.author) + '</span><span class="sep">·</span>' +
      '<time datetime="' + p.date + '">' + fmtDate(p.dateObj) + '</time><span class="sep">·</span>' +
      '<span>' + p.minutes + ' 分钟阅读</span><span class="sep">·</span>' +
      '<span>' + p.chars + ' 字</span>' +
      '</div></header>' +

      bookStrip(p) +

      cover(p, 'article-cover') +

      '<div class="article-grid">' +
      '<div class="prose" id="prose">' + article + '</div>' +
      '<aside class="toc-col"><nav class="toc" id="toc" aria-label="文章目录"></nav>' +
      '<p class="toc-note">用 <kbd>/</kbd> 搜索全站<br>按 <kbd>Esc</kbd> 关闭弹层</p>' +
      '</aside></div>' +

      '<div class="post-end">' +
      '<div class="card-tags">' + tagsHtml(p) + '</div>' +
      '<div class="actions">' +
      '<button class="act' + (liked ? ' on' : '') + '" data-action="like" data-slug="' + p.slug + '" aria-pressed="' + liked + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 20.3s-7.3-4.6-7.3-9.4a4.1 4.1 0 017.3-2.6 4.1 4.1 0 017.3 2.6c0 4.8-7.3 9.4-7.3 9.4z"/></svg>' +
      '<span class="like-n">' + likes + '</span></button>' +
      '<button class="act' + (saved ? ' on' : '') + '" data-action="bookmark" data-slug="' + p.slug + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6.5 4.5h11v16l-5.5-3.7-5.5 3.7z"/></svg>' +
      '<span>' + (saved ? '已收藏' : '收藏') + '</span></button>' +
      '<button class="act" data-action="share" data-slug="' + p.slug + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M9 8h6M9 16h3"/><rect x="3.5" y="3.5" width="17" height="17" rx="4"/></svg>' +
      '<span>复制链接</span></button>' +
      '</div></div>' +

      '<nav class="post-nav" aria-label="上下篇">' +
      (prev
        ? '<a class="pn" href="' + postHref(prev) + '"><span class="pn-label">← 上一篇</span><span class="pn-title">' + esc(prev.title) + '</span></a>'
        : '<span class="pn empty"><span class="pn-label">← 上一篇</span><span class="pn-title">已经是最新一篇</span></span>') +
      (next
        ? '<a class="pn next" href="' + postHref(next) + '"><span class="pn-label">下一篇 →</span><span class="pn-title">' + esc(next.title) + '</span></a>'
        : '<span class="pn next empty"><span class="pn-label">下一篇 →</span><span class="pn-title">已经是最后一篇</span></span>') +
      '</nav>' +

      '<section class="related">' +
      secHead('相关文章', '<a class="more" href="#/category/' + encodeURIComponent(p.category) + '">更多「' + esc(p.category) + '」→</a>') +
      '<div class="post-grid">' + rel.map(postCard).join('') + '</div>' +
      '</section>' +

      '<section class="comments" id="comments">' +
      '<div class="sec-head"><h2>评论 <span class="count">' + comments.length + '</span></h2>' +
      '<span class="more">仅保存在你自己的浏览器</span></div>' +
      '<form class="comment-form" data-comment-form data-slug="' + p.slug + '">' +
      '<input name="name" maxlength="20" placeholder="你的昵称" value="' + esc(name) + '" required>' +
      '<textarea name="text" maxlength="600" placeholder="说点什么…（Ctrl + Enter 发送）" required></textarea>' +
      '<div class="form-foot"><span class="hint">评论保存在 localStorage，换设备不会同步</span>' +
      '<button class="btn" type="submit">发表评论</button></div>' +
      '</form>' +
      '<div id="commentList">' + commentsBody(p.slug) + '</div>' +
      '</section>' +

      '</article></div>';
  }

  /* ---------------- 视图：分类 / 标签 ---------------- */
  function viewCategories() {
    return '<div class="wrap">' +
      '<header class="page-head"><h1>分类</h1><p>' + catList.length + ' 个主题，随笔六类，教程按方向分十一条线（C/C++、Python、AI、网络安全、二进制、逆向、CTF、内网、Windows 内核、固件与 IoT、样本分析）。每篇只归入一个分类。</p></header>' +
      '<div class="cat-grid">' + catList.map(function (c) {
        var list = posts.filter(function (p) { return p.category === c.name; });
        return '<a class="cat-card" href="#/category/' + encodeURIComponent(c.name) + '" style="--c1:' + c.c1 + ';--c2:' + c.c2 + '">' +
          '<div class="cat-top"><span class="cat-name">' + esc(c.name) + '</span><span class="cat-count">' + pad(c.count) + ' 篇</span></div>' +
          '<p class="cat-desc">' + esc(c.desc) + '</p>' +
          '<div class="cat-posts">' + list.slice(0, 3).map(function (p, i) {
            return '<a href="' + postHref(p) + '"><i>' + pad(i + 1) + '</i>' + esc(p.title) + '</a>';
          }).join('') + '</div></a>';
      }).join('') + '</div></div>';
  }

  function viewTags() {
    var max = tagList.reduce(function (m, t) { return Math.max(m, t.count); }, 1);
    return '<div class="wrap">' +
      '<header class="page-head"><h1>标签</h1><p>比分类更细的线索。同一个标签下的文章，往往共享某个反复出现的念头。</p>' +
      '<p class="count">' + tagList.length + ' 个标签 · ' + posts.length + ' 篇文章</p></header>' +
      '<div class="tag-cloud">' + tagList.map(function (t) {
        var s = t.count >= max ? 4 : t.count >= max - 1 ? 3 : t.count > 1 ? 2 : 1;
        return '<a class="tag-item s' + s + '" href="' + tagHref(t.name) + '">' + esc(t.name) + ' <b>' + t.count + '</b></a>';
      }).join('') + '</div></div>';
  }

  /* ---------------- 视图：书架 ---------------- */
  function viewBooks(field) {
    var shown = field ? bookPosts.filter(function (p) { return p.book.field === field; }) : bookPosts;
    var totalQuotes = bookPosts.reduce(function (n, p) { return n + p.quotes; }, 0);

    var chips = '<a class="chip' + (field ? '' : ' on') + '" href="#/books">全部 <b>' + pad(bookPosts.length) + '</b></a>' +
      bookFields.map(function (f) {
        var c = bookPosts.filter(function (p) { return p.book.field === f; }).length;
        return '<a class="chip' + (field === f ? ' on' : '') + '" href="#/books?field=' + encodeURIComponent(f) + '">' +
          esc(f) + ' <b>' + pad(c) + '</b></a>';
      }).join('');

    return '<div class="wrap">' +
      '<header class="page-head"><h1>书架</h1>' +
      '<p>十一条学习线：C/C++、Python、AI 打底，再往深处走是网络安全、二进制、逆向、CTF、内网、Windows 内核、固件与 IoT、样本分析。每本对应一篇可操作的实战笔记。</p>' +
      '<p class="count">' + bookPosts.length + ' 本 · ' + bookFields.length + ' 个领域 · 全部可运行</p>' +
      '<div class="chips">' + chips + '</div></header>' +
      (shown.length ? '<div class="book-grid">' + shown.map(bookCard).join('') + '</div>'
        : '<div class="empty">这个领域还没有摘录。</div>') +
      '<p class="shelf-note">引文为短句摘录，用于评论与学习；除标注「大意自译」外，均引自中文通行译本。' +
      '如果你发现引文有误，<a href="#/about">写信告诉我</a>，我会在文末标注修订。</p>' +
      '</div>';
  }

  /* ---------------- 视图：归档 ---------------- */
  function viewArchive() {
    var years = {};
    posts.forEach(function (p) {
      var y = p.dateObj.getFullYear();
      (years[y] = years[y] || []).push(p);
    });
    var keys = Object.keys(years).sort(function (a, b) { return b - a; });

    return '<div class="wrap">' +
      '<header class="page-head"><h1>归档</h1><p>按时间倒序排列。' + posts.length + ' 篇文章，从 ' +
      (SITE.since || '2026') + ' 年写到现在。</p></header>' +
      '<div class="archive">' + keys.map(function (y) {
        var list = years[y];
        return '<section class="year"><div class="year-head"><h2>' + y + '</h2><span class="line"></span>' +
          '<span class="num">' + pad(list.length) + ' 篇</span></div>' +
          '<ul class="arc-list">' + list.map(function (p) {
            return '<li class="arc-item"><a class="arc-date" href="' + postHref(p) + '">' + pad(p.dateObj.getMonth() + 1) + '/' + pad(p.dateObj.getDate()) + '</a>' +
              '<a class="arc-title" href="' + postHref(p) + '">' + esc(p.title) + '</a>' +
              '<span class="arc-cat">' + esc(p.category) + '</span></li>';
          }).join('') + '</ul></section>';
      }).join('') + '</div></div>';
  }

  /* ---------------- 视图：关于 ---------------- */
  function viewAbout() {
    var facts = [
      ['建站', (SITE.since || 2026) + ' 年'],
      ['技术', 'HTML / CSS / JS'],
      ['文章', posts.length + ' 篇 · 约 ' + (totalChars / 1000).toFixed(1) + ' 千字'],
      ['主题', '纸墨（浅色）/ 夜读（深色）'],
      ['字体', '系统衬线 + 无衬线'],
      ['数据', '全部存于本机']
    ];
    var principles = [
      '写清楚一件事，比写完整十件事重要。',
      '不追热点。热点会过期，思考不会。',
      '宁可短，不要凑。没想明白就先不发。',
      '承认不知道。文章里保留不确定的部分。',
      '不接广告，不做推荐算法，不加追踪脚本。'
    ];

    return '<div class="wrap">' +
      '<section class="about-hero">' +
      '<div><p class="eyebrow"><span class="pulse"></span>关于</p>' +
      '<h1>你好，我是' + esc(SITE.author) + '。</h1>' +
      (SITE.intro || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '</div>' +
      '<div class="profile-card"><div class="avatar">' + esc((SITE.author || '阿').charAt(0)) + '</div>' +
      '<h3>' + esc(SITE.author) + '</h3>' +
      '<p class="role">' + esc(SITE.role) + '</p>' +
      '<div class="profile-links">' +
      '<a href="mailto:' + esc(SITE.email) + '">邮箱 <span>mail</span></a>' +
      (SITE.github ? '<a href="' + esc(SITE.github) + '" target="_blank" rel="noopener">GitHub <span>code</span></a>' : '') +
      '<a href="feed.xml">RSS <span>xml</span></a>' +
      '</div></div></section>' +

      '<section class="section" style="border-top:1px solid var(--line-2);margin-top:46px">' +
      '<div class="about-grid" style="margin-top:0">' +
      '<div class="block"><h2>现在</h2><dl class="now-list">' +
      (SITE.now || []).map(function (n) { return '<div><dt>' + esc(n[0]) + '</dt><dd>' + esc(n[1]) + '</dd></div>'; }).join('') +
      '</dl><p style="margin-top:18px;font-size:13px;color:var(--muted)">这个清单会随状态更新，参考了 /now 页面的做法。</p></div>' +
      '<div class="block"><h2>这个站</h2><dl class="facts">' +
      facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') +
      '</dl></div>' +
      '</div></section>' +

      '<section class="section">' +
      '<div class="about-grid" style="margin-top:0">' +
      '<div class="block"><h2>写东西的原则</h2><ol class="principles">' +
      principles.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ol></div>' +
      '<div class="block"><h2>联系</h2>' +
      '<p>最有效的方式是邮件：<a href="mailto:' + esc(SITE.email) + '" style="color:var(--accent)">' + esc(SITE.email) + '</a>。</p>' +
      '<p>写代码、做设计、读书笔记都聊。如果是文章里的错误，欢迎直接指出，我会在文末标注修订。</p>' +
      '<p style="color:var(--muted);font-size:13px">本站不设留言审核，也没有后台——所有评论都存在你自己的浏览器里，刷新还在，换设备就不在。</p>' +
      '<div class="actions" style="margin-top:18px">' +
      '<button class="act" data-action="copy" data-text="' + esc(SITE.email) + '">复制邮箱</button>' +
      '<a class="act" href="feed.xml">订阅 RSS</a></div>' +
      '</div></div></section>' +
      '</div>';
  }

  /* ---------------- 视图：收藏 / 搜索 / 404 ---------------- */
  function viewBookmarks() {
    var saved = store.get('bookmarks', []).map(function (s) { return bySlug[s]; }).filter(Boolean);
    return '<div class="wrap">' +
      '<header class="page-head"><h1>我的收藏</h1><p>收藏保存在本机浏览器里，不会上传。换设备或清除站点数据后会消失。</p></header>' +
      (saved.length
        ? '<div class="post-list">' + saved.map(postRow).join('') + '</div>'
        : '<div class="empty">还没有收藏。在文章底部点「收藏」，就会出现在这里。</div>') +
      '</div>';
  }

  function viewSearchPage(q) {
    var results = q ? searchPosts(q) : posts.slice(0, 6);
    return '<div class="wrap">' +
      '<header class="page-head"><h1>搜索</h1>' +
      '<p>' + (q ? '关键词「' + esc(q) + '」的结果：' + results.length + ' 篇' : '输入关键词开始搜索，或在任意页面按 / 打开搜索框。') + '</p>' +
      '<p class="count">' + (q ? results.length + ' 篇匹配' : '最近发布 · ' + results.length + ' 篇') + '</p></header>' +
      '<div class="result-list">' + (results.length
        ? results.map(function (p) {
          return '<a class="result" href="' + postHref(p) + '"><h3>' + esc(p.title) + '</h3>' +
            '<p>' + esc(p.excerpt) + '</p>' +
            '<div class="row-meta"><span>' + fmtDate(p.dateObj) + '</span><span class="sep">·</span>' +
            '<span>' + esc(p.category) + '</span><span class="sep">·</span><span>' + p.minutes + ' 分钟</span></div></a>';
        }).join('')
        : '<div class="empty">没有找到相关文章。试试更短的词，或者去<a href="#/archive" style="color:var(--accent)">归档</a>翻翻。</div>') +
      '</div></div>';
  }

  function viewNotFound() {
    return '<div class="wrap"><div class="notfound">' +
      '<div class="big">404</div>' +
      '<h1>这页可能已经被删掉了</h1>' +
      '<p>链接可能写错了，或者这篇文章还没写。要不回首页看看？</p>' +
      '<div class="actions">' +
      '<a class="act" href="#/">返回首页</a>' +
      '<a class="act" href="#/posts">全部文章</a>' +
      '<button class="act" data-action="open-search">搜索一下</button>' +
      '</div></div></div>';
  }

  /* ---------------- 路由 ---------------- */
  var app = $('#main');
  var currentPath = '';

  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qi = raw.indexOf('?');
    var pathPart = qi > -1 ? raw.slice(0, qi) : raw;
    var query = new URLSearchParams(qi > -1 ? raw.slice(qi + 1) : '');
    var segs = pathPart.split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    return { segs: segs, query: query, path: pathPart };
  }

  function render() {
    var r = parseHash();
    var segs = r.segs;
    var html = '';
    var title = SITE.name || '阿飞观察站';
    var navKey = '';

    if (segs.length === 0 || (segs.length === 1 && segs[0] === '')) {
      html = viewHome();
      navKey = 'home';
      title = SITE.name + ' · ' + SITE.tagline;
    } else if (segs[0] === 'posts') {
      html = viewPosts(parseInt(r.query.get('page'), 10) || 1);
      navKey = 'posts';
      title = '全部文章 · ' + SITE.name;
    } else if (segs[0] === 'post') {
      var p = bySlug[segs[1]];
      if (p) {
        html = viewPost(p);
        title = p.title + ' · ' + SITE.name;
        navKey = 'posts';
      } else {
        html = viewNotFound();
        title = '找不到页面 · ' + SITE.name;
      }
    } else if (segs[0] === 'books') {
      html = viewBooks(r.query.get('field') || '');
      navKey = 'books';
      title = '书架 · ' + SITE.name;
    } else if (segs[0] === 'categories') {
      html = viewCategories(); navKey = 'categories'; title = '分类 · ' + SITE.name;
    } else if (segs[0] === 'category') {
      var cname = segs[1];
      var list = posts.filter(function (x) { return x.category === cname; });
      html = viewFiltered(cname, (CATS[cname] || {}).desc || '文章分类', list, cname);
      navKey = 'categories';
      title = cname + ' · ' + SITE.name;
    } else if (segs[0] === 'tags') {
      html = viewTags(); navKey = 'tags'; title = '标签 · ' + SITE.name;
    } else if (segs[0] === 'tag') {
      var tname = segs[1];
      var tlist = posts.filter(function (x) { return x.tags.indexOf(tname) > -1; });
      html = viewFiltered('#' + tname, '带有这个标签的全部文章。', tlist, '');
      navKey = 'tags';
      title = '#' + tname + ' · ' + SITE.name;
    } else if (segs[0] === 'archive') {
      html = viewArchive(); navKey = 'archive'; title = '归档 · ' + SITE.name;
    } else if (segs[0] === 'about') {
      html = viewAbout(); navKey = 'about'; title = '关于 · ' + SITE.name;
    } else if (segs[0] === 'bookmarks') {
      html = viewBookmarks(); title = '我的收藏 · ' + SITE.name;
    } else if (segs[0] === 'search') {
      html = viewSearchPage(r.query.get('q') || '');
      title = '搜索 · ' + SITE.name;
    } else if (segs[0] === 'not-found') {
      html = viewNotFound();
    } else {
      html = viewNotFound();
      title = '找不到页面 · ' + SITE.name;
    }

    app.innerHTML = html;
    document.title = title;

    $$('.nav a').forEach(function (a) {
      var on = a.getAttribute('data-nav') === navKey;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    var isNewPath = r.path !== currentPath;
    currentPath = r.path;
    if (isNewPath) window.scrollTo(0, 0);

    afterRender();
  }

  function afterRender() {
    var prose = $('#prose');
    if (prose) {
      buildToc(prose);
      var bar = $('#progressBar');
      if (bar) bar.style.width = '0%';
    }
    updateProgress();
    updateToTop();
  }

  function buildToc(prose) {
    var toc = $('#toc');
    if (!toc) return;
    var hs = $$('h2, h3', prose);
    if (hs.length < 2) {
      var col = toc.closest('.toc-col');
      if (col) col.style.display = 'none';
      return;
    }
    hs.forEach(function (h, i) { h.id = 'sec-' + i; });
    toc.innerHTML = '<p class="toc-title">目录</p>' + hs.map(function (h) {
      return '<a href="javascript:void(0)" data-scroll="' + h.id + '" class="' + (h.tagName === 'H3' ? 'lv3' : '') + '">' + esc(h.textContent.replace(/^§\s*/, '')) + '</a>';
    }).join('');
  }

  /* ---------------- 滚动相关 ---------------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateProgress();
      updateSpy();
      updateToTop();
      ticking = false;
    });
  }

  function updateProgress() {
    var bar = $('#progressBar');
    if (!bar) return;
    var art = $('#prose');
    if (!art) { bar.style.width = '0%'; return; }
    var rect = art.getBoundingClientRect();
    var total = rect.height - window.innerHeight * 0.55;
    var passed = Math.min(Math.max(120 - rect.top, 0), Math.max(total, 1));
    bar.style.width = (passed / Math.max(total, 1) * 100).toFixed(1) + '%';
  }

  function updateSpy() {
    var hs = $$('#prose h2, #prose h3');
    if (!hs.length) return;
    var cur = hs[0].id;
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].getBoundingClientRect().top <= 140) cur = hs[i].id;
    }
    $$('.toc a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-scroll') === cur);
    });
  }

  function updateToTop() {
    var btn = $('#toTop');
    if (!btn) return;
    if (window.scrollY > 600) btn.removeAttribute('hidden');
    else btn.setAttribute('hidden', '');
  }

  /* ---------------- 主题 ---------------- */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    store.set('theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141210' : '#faf7f2');
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
    toast(cur === 'dark' ? '已切换到浅色主题' : '已切换到深色主题');
  }

  /* ---------------- 抽屉菜单 ---------------- */
  function closeMenu() {
    var d = $('#drawer');
    var b = $('.menu-btn');
    if (d) d.setAttribute('hidden', '');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    var d = $('#drawer');
    var b = $('.menu-btn');
    if (!d) return;
    if (d.hasAttribute('hidden')) {
      d.removeAttribute('hidden');
      b.setAttribute('aria-expanded', 'true');
    } else {
      closeMenu();
    }
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  /* ---------------- 复制 ---------------- */
  function copyText(text) {
    var done = function () { toast('已复制到剪贴板'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }

  /* ---------------- 点赞 / 收藏 ---------------- */
  function toggleLike(slug, btn) {
    var liked = store.get('liked', []);
    var i = liked.indexOf(slug);
    var p = bySlug[slug];
    if (i > -1) liked.splice(i, 1);
    else liked.push(slug);
    store.set('liked', liked);
    var on = i === -1;
    if (btn) {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      var n = btn.querySelector('.like-n');
      if (n && p) n.textContent = p.no * 6 + 4 + (on ? 1 : 0);
    }
    toast(on ? '谢谢喜欢' : '已取消');
  }

  function toggleBookmark(slug, btn) {
    var saved = store.get('bookmarks', []);
    var i = saved.indexOf(slug);
    var on = i === -1;
    if (on) saved.unshift(slug); else saved.splice(i, 1);
    store.set('bookmarks', saved);
    if (btn) {
      btn.classList.toggle('on', on);
      var label = btn.querySelector('span');
      if (label) label.textContent = on ? '已收藏' : '收藏';
    }
    toast(on ? '已加入收藏' : '已取消收藏');
  }

  function sharePost(slug) {
    var p = bySlug[slug];
    copyText(location.href.split('#')[0] + '#/post/' + encodeURIComponent(slug));
    if (p) document.title = p.title + ' · ' + SITE.name;
  }

  /* ---------------- 评论 ---------------- */
  function submitComment(form) {
    var slug = form.getAttribute('data-slug');
    var name = (form.elements.name.value || '').trim();
    var text = (form.elements.text.value || '').trim();
    if (!name) { toast('写个昵称吧'); form.elements.name.focus(); return; }
    if (!text) { toast('评论还是空的'); form.elements.text.focus(); return; }

    var list = store.get('comments:' + slug, []);
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name.slice(0, 20),
      text: text.slice(0, 600),
      ts: Date.now()
    });
    store.set('comments:' + slug, list);
    store.set('commenter', name);

    form.elements.text.value = '';
    var wrap = $('#commentList');
    if (wrap) wrap.innerHTML = commentsBody(slug);
    var count = $('.comments .count');
    if (count) count.textContent = list.length;
    toast('评论已保存到本机');
  }

  function deleteComment(slug, cid) {
    var list = store.get('comments:' + slug, []).filter(function (c) { return c.id !== cid; });
    store.set('comments:' + slug, list);
    var wrap = $('#commentList');
    if (wrap) wrap.innerHTML = commentsBody(slug);
    var count = $('.comments .count');
    if (count) count.textContent = list.length;
    toast('已删除');
  }

  function replyTo(name) {
    var ta = $('.comment-form textarea');
    if (!ta) return;
    ta.value = '@' + name + ' ' + ta.value.replace(/^@\S+\s*/, '');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  /* ---------------- 搜索 ---------------- */
  var searchIndex = posts.map(function (p) {
    var plain = p.markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*`|]/g, ' ')
      .replace(/\s+/g, ' ');
    return { p: p, text: plain.toLowerCase() };
  });

  function searchPosts(q) {
    var terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return searchIndex.map(function (item) {
      var p = item.p;
      var score = 0;
      terms.forEach(function (t) {
        if (p.title.toLowerCase().indexOf(t) > -1) score += 12;
        if (p.tags.join(' ').toLowerCase().indexOf(t) > -1) score += 7;
        if (p.category.toLowerCase().indexOf(t) > -1) score += 5;
        if (p.excerpt.toLowerCase().indexOf(t) > -1) score += 4;
        var c = item.text.split(t).length - 1;
        score += Math.min(c, 6);
      });
      return { p: p, score: score };
    }).filter(function (o) { return o.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (o) { return o.p; });
  }

  function highlight(text, terms) {
    var s = esc(text);
    if (!terms.length) return s;
    var re = new RegExp('(' + terms.map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')', 'gi');
    return s.replace(re, '<mark>$1</mark>');
  }

  var sm = { open: false, items: [], sel: 0 };

  function openSearch() {
    var modal = $('#searchModal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    sm.open = true;
    document.body.style.overflow = 'hidden';
    var input = $('#searchInput');
    if (input) {
      input.value = '';
      setTimeout(function () { input.focus(); }, 30);
    }
    renderSearch('');
  }

  function closeSearch() {
    var modal = $('#searchModal');
    if (!modal || modal.hasAttribute('hidden')) return;
    modal.setAttribute('hidden', '');
    sm.open = false;
    document.body.style.overflow = '';
  }

  function renderSearch(q) {
    var box = $('#searchResults');
    var countEl = $('#searchCount');
    if (!box) return;
    var terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var results = terms.length ? searchPosts(q) : posts.slice(0, 5);

    if (!results.length) {
      box.innerHTML = '<div class="sm-empty">没有找到「' + esc(q) + '」相关的文章。<br>试试更短的词，或者按 Esc 去归档里翻翻。</div>';
      if (countEl) countEl.textContent = '0 篇';
      sm.items = [];
      return;
    }

    box.innerHTML = results.map(function (p, i) {
      return '<a class="sm-item' + (i === 0 ? ' sel' : '') + '" href="' + postHref(p) + '" data-idx="' + i + '">' +
        '<span class="sm-thumb" style="--c1:' + p.c1 + ';--c2:' + p.c2 + '">' + pad(p.no) + '</span>' +
        '<span class="sm-info"><strong>' + highlight(p.title, terms) + '</strong>' +
        '<span>' + esc(p.category) + ' · ' + fmtShort(p.dateObj) + ' · ' + p.minutes + ' 分钟</span></span>' +
        '<span class="sm-cat">' + esc(p.tags[0] || p.category) + '</span></a>';
    }).join('');

    sm.items = results;
    sm.sel = 0;
    if (countEl) countEl.textContent = results.length + ' 篇';
  }

  function moveSel(delta) {
    var nodes = $$('.sm-item');
    if (!nodes.length) return;
    sm.sel = (sm.sel + delta + nodes.length) % nodes.length;
    nodes.forEach(function (n, i) { n.classList.toggle('sel', i === sm.sel); });
    nodes[sm.sel].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- 事件绑定 ---------------- */
  document.addEventListener('click', function (e) {
    var scope = e.target.closest('[data-action]');
    if (scope) {
      var action = scope.getAttribute('data-action');
      if (action === 'open-search') { e.preventDefault(); openSearch(); }
      else if (action === 'close-search') { closeSearch(); }
      else if (action === 'toggle-theme') { toggleTheme(); }
      else if (action === 'toggle-menu') { toggleMenu(); }
      else if (action === 'scroll-top') { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (action === 'like') { toggleLike(scope.getAttribute('data-slug'), scope); }
      else if (action === 'bookmark') { toggleBookmark(scope.getAttribute('data-slug'), scope); }
      else if (action === 'share') { sharePost(scope.getAttribute('data-slug')); }
      else if (action === 'copy') { e.preventDefault(); copyText(scope.getAttribute('data-text')); }
      else if (action === 'copy-code') {
        var cb = scope.closest('.code-block');
        if (cb) {
          copyText(cb.querySelector('code').textContent);
          var old = scope.textContent;
          scope.textContent = '已复制';
          setTimeout(function () { scope.textContent = old; }, 1600);
        }
      }
      else if (action === 'reply') { replyTo(scope.getAttribute('data-name')); }
      else if (action === 'del-comment') {
        if (confirm('删除这条评论？')) deleteComment(scope.getAttribute('data-slug'), scope.getAttribute('data-cid'));
      }
      return;
    }

    var sc = e.target.closest('[data-scroll]');
    if (sc) {
      e.preventDefault();
      var el = document.getElementById(sc.getAttribute('data-scroll'));
      if (el) {
        var top = el.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
      return;
    }

    if (e.target.closest('.sm-item')) {
      setTimeout(closeSearch, 60);
    }

    if (e.target.closest('#drawer a')) closeMenu();
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();
    submitComment(form);
  });

  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);

    if (e.key === 'Escape') {
      closeSearch();
      closeMenu();
      if (typing) document.activeElement.blur();
      return;
    }

    if (sm.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (sm.items[sm.sel]) location.hash = '#/post/' + encodeURIComponent(sm.items[sm.sel].slug);
        closeSearch();
      }
      return;
    }

    if (e.key === '/' && !typing) {
      e.preventDefault();
      openSearch();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      var f = document.activeElement && document.activeElement.closest('[data-comment-form]');
      if (f) { e.preventDefault(); submitComment(f); }
    }
  });

  $('#searchInput') && $('#searchInput').addEventListener('input', function (e) {
    renderSearch(e.target.value);
  });

  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------------- 路由过场（扣篮加载层） ---------------- */
  var loaderEl = null;
  var loaderTimers = [];

  function clearLoaderTimers() {
    loaderTimers.forEach(function (t) { clearTimeout(t); });
    loaderTimers = [];
  }

  function showLoader() {
    if (!loaderEl) loaderEl = document.getElementById('loader');
    if (!loaderEl) return;
    clearLoaderTimers();
    loaderEl.classList.remove('out');
    // 过场是用户明确要求的品牌动效：即使系统开了「减少动态效果」也照常播放，
    // 时长控制在 0.6s 内，不做长时间动效。
    loaderEl.classList.remove('is-static');
    loaderEl.classList.add('on');
    loaderEl.setAttribute('aria-hidden', 'false');
    // 最短展示 560ms，再淡出 300ms；连续点击时会被上面的 clear 重置
    loaderTimers.push(setTimeout(function () {
      if (loaderEl) loaderEl.classList.add('out');
    }, 600));
    loaderTimers.push(setTimeout(function () {
      if (!loaderEl) return;
      loaderEl.classList.remove('on', 'out');
      loaderEl.setAttribute('aria-hidden', 'true');
    }, 920));
  }

  var firstRender = true;
  function renderWithLoader() {
    // 首次进入不放过场，避免开局就糊一层
    if (firstRender) {
      firstRender = false;
      render();
      return;
    }
    showLoader();
    render();
  }

  window.addEventListener('hashchange', renderWithLoader);

  /* ---------------- 初始化 ---------------- */
  function init() {
    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    var fc = $('#footCats');
    if (fc) {
      fc.insertAdjacentHTML('beforeend', catList.map(function (c) {
        return '<a href="#/category/' + encodeURIComponent(c.name) + '">' + esc(c.name) + '</a>';
      }).join(''));
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    render();
    firstRender = false;   // 首屏已渲染，后续导航都要显示过场
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
