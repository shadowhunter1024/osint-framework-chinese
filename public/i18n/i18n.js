/**
 * OSINT Framework 中文汉化（仅显示层）
 *
 * 加载顺序：index.html 中紧跟 d3.min.js 之后、arf.js 之前。
 *  - 包装 d3.json：arf.js 读取 arf.json 后，先用词典替换分类名与工具说明再交给树形图。
 *  - MutationObserver：把页面上的固定界面文字与提示属性替换为中文。
 *  - 在页眉加入“English / 中文”切换按钮（保存在 localStorage）。
 * 词典缺失的条目一律回退显示英文。工具名称、URL 与 arf.json 结构保持不变。
 */
(function(global) {
  "use strict";

  var LANGUAGES = ["zh-CN", "en"];
  var DEFAULT_LANGUAGE = "zh-CN";
  var STORAGE_KEY = "language";
  var DICT_BASE = "i18n/zh-CN/";
  // 工具条目中需要翻译的字段（其余字段均为程序使用的取值，保持英文）
  var TOOL_FIELDS = ["description", "bestFor", "input", "output", "opsecNote"];
  // 模式键（如 "Open {0} ↗"）中字面文字的最小长度，避免过短的模式误匹配
  var MIN_PATTERN_LITERAL = 3;

  var TRANSLATABLE_ATTRS = ["title", "placeholder", "aria-label"];
  // 这些区域显示的是数据（工具名、已翻译的说明、用户输入），不做界面文字替换
  var SKIP_SELECTOR = "script, style, svg, noscript, textarea, [data-i18n-skip], " +
    "#panel-title, #panel-breadcrumb, #panel-description, #panel-usage, #panel-io, " +
    ".opsec-note, .search-result-name, .search-result-path";

  // ---------- 词典 ----------

  function toMap(obj) {
    var map = new Map();
    if (!obj || typeof obj !== "object") return map;
    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      if (typeof value === "string" && value.trim() !== "" && key.charAt(0) !== "_") {
        map.set(key, value);
      }
    });
    return map;
  }

  var dicts = {
    ui: new Map(),
    categories: new Map(),
    tools: new Map(),
    patterns: []
  };

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compilePatterns(uiMap) {
    var patterns = [];
    uiMap.forEach(function(value, key) {
      if (!/\{\d\}/.test(key)) return;
      var literal = key.replace(/\{\d\}/g, "");
      if (literal.trim().length < MIN_PATTERN_LITERAL) return;
      var order = [];
      var source = key.split(/(\{\d\})/).map(function(part) {
        var m = /^\{(\d)\}$/.exec(part);
        if (m) {
          order.push(Number(m[1]));
          return "(.+?)";
        }
        return escapeRegExp(part);
      }).join("");
      patterns.push({ re: new RegExp("^" + source + "$"), order: order, value: value });
    });
    return patterns;
  }

  function setDictionaries(ui, categories, tools) {
    dicts.ui = toMap(ui);
    dicts.categories = toMap(categories);
    dicts.tools = toMap(tools);
    dicts.patterns = compilePatterns(dicts.ui);
  }

  function normalise(str) {
    return String(str).replace(/\s+/g, " ").trim();
  }

  /** 查界面词典：先精确匹配，再匹配 {0} 模式。没有译文时返回 null。 */
  function lookupUi(str) {
    if (typeof str !== "string") return null;
    var key = normalise(str);
    if (!key) return null;
    if (dicts.ui.has(key)) return dicts.ui.get(key);
    for (var i = 0; i < dicts.patterns.length; i++) {
      var p = dicts.patterns[i];
      var m = p.re.exec(key);
      if (!m) continue;
      var values = [];
      p.order.forEach(function(n, idx) { values[n] = m[idx + 1]; });
      return p.value.replace(/\{(\d)\}/g, function(all, n) {
        return values[Number(n)] !== undefined ? values[Number(n)] : all;
      });
    }
    return null;
  }

  /** 翻译界面文字，缺失时返回原文。 */
  function t(str) {
    var translated = lookupUi(str);
    return translated === null ? str : translated;
  }

  // ---------- arf.json 数据 ----------

  /**
   * 原地替换 arf.json 中的显示字段：分类名称与工具说明。
   * 英文原文保存在 node._en 中（供搜索使用）；name 对工具保持不变。
   */
  function translateData(root) {
    var stack = [root];
    var count = 0;
    while (stack.length) {
      var node = stack.pop();
      if (!node || typeof node !== "object") continue;
      var en = Object.create(null);
      var isCategory = Array.isArray(node.children) && !node.url;
      if (isCategory && typeof node.name === "string" && dicts.categories.has(node.name)) {
        en.name = node.name;
        node.name = dicts.categories.get(node.name);
        count++;
      }
      if (node.url) {
        TOOL_FIELDS.forEach(function(field) {
          var value = node[field];
          if (typeof value === "string" && dicts.tools.has(value)) {
            en[field] = value;
            node[field] = dicts.tools.get(value);
            count++;
          }
        });
      }
      if (Object.keys(en).length) {
        Object.defineProperty(node, "_en", { value: en, enumerable: false });
      }
      if (Array.isArray(node.children)) {
        for (var i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      }
    }
    return count;
  }

  /** 搜索时额外匹配的英文原文（说明被替换为中文后仍可用英文搜索）。 */
  function searchText(data) {
    return data && data._en && data._en.description ? data._en.description : "";
  }

  // ---------- DOM ----------

  function isSkipped(el) {
    return !!(el && el.closest && el.closest(SKIP_SELECTOR));
  }

  function translateTextNode(node) {
    var value = node.nodeValue;
    if (!value || !/[A-Za-z]/.test(value)) return;
    if (isSkipped(node.parentElement)) return;
    var translated = lookupUi(value);
    if (translated === null) return;
    var lead = /^\s*/.exec(value)[0];
    var trail = /\s*$/.exec(value)[0];
    var next = lead + translated + trail;
    // 译文与原文相同时不写回，否则会再次触发 MutationObserver 形成死循环
    if (next !== value) node.nodeValue = next;
  }

  function translateAttributes(el) {
    if (isSkipped(el)) return;
    TRANSLATABLE_ATTRS.forEach(function(attr) {
      if (!el.hasAttribute(attr)) return;
      var value = el.getAttribute(attr);
      var translated = lookupUi(value);
      if (translated !== null && translated !== value) el.setAttribute(attr, translated);
    });
  }

  function translateDom(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) translateAttributes(root);
    var doc = root.ownerDocument || root;
    var walker = doc.createTreeWalker(root, 1 | 4, null);
    var node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) {
        translateTextNode(node);
      } else {
        translateAttributes(node);
      }
      node = walker.nextNode();
    }
  }

  function observeDom(root) {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === "childList") {
          m.addedNodes.forEach(translateDom);
        } else if (m.type === "characterData") {
          translateTextNode(m.target);
        } else if (m.type === "attributes") {
          var value = m.target.getAttribute(m.attributeName);
          var translated = lookupUi(value);
          if (translated !== null && translated !== value && !isSkipped(m.target)) {
            m.target.setAttribute(m.attributeName, translated);
          }
        }
      });
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS
    });
    return observer;
  }

  // ---------- 语言 ----------

  function readStorage(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function getLanguage() {
    var fromUrl = /[?&]lang=([\w-]+)/.exec(global.location ? global.location.search : "");
    var lang = fromUrl ? fromUrl[1] : readStorage(STORAGE_KEY);
    return LANGUAGES.indexOf(lang) !== -1 ? lang : DEFAULT_LANGUAGE;
  }

  function setLanguage(lang) {
    try {
      global.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* 隐私模式下无法保存，忽略 */ }
  }

  // ---------- 社区功能（评分 / 报告 / 点击统计） ----------

  // 这些功能依赖官方 Cloudflare Worker 的 /api/*。静态托管（GitHub Pages）或本地文件下没有该接口，
  // 因此隐藏相应区域并拦截请求，避免无效请求和一直显示“…”。
  function communityApiAvailable() {
    var loc = global.location;
    if (!loc || loc.protocol === "file:") return false;
    return !/\.github\.io$/i.test(loc.hostname);
  }

  function disableCommunityApi() {
    var isApi = function(url) {
      return typeof url === "string" && /^\/api\//.test(url);
    };
    if (global.fetch) {
      var origFetch = global.fetch;
      global.fetch = function(input) {
        if (isApi(input)) return Promise.resolve(new Response(null, { status: 404 }));
        return origFetch.apply(this, arguments);
      };
    }
    if (global.navigator && global.navigator.sendBeacon) {
      var origBeacon = global.navigator.sendBeacon.bind(global.navigator);
      global.navigator.sendBeacon = function(url) {
        if (isApi(url)) return true;
        return origBeacon.apply(null, arguments);
      };
    }
  }

  // ---------- 初始化 ----------

  function loadJson(path) {
    return fetch(path).then(function(r) {
      return r.ok ? r.json() : {};
    }).catch(function() {
      return {};
    });
  }

  function hookD3(dictsReady) {
    var d3 = global.d3;
    if (!d3 || typeof d3.json !== "function") return;
    var origJson = d3.json;
    d3.json = function(url) {
      var p = origJson.apply(this, arguments);
      if (typeof url !== "string" || !/(^|\/)arf\.json(\?|#|$)/.test(url)) return p;
      return Promise.all([p, dictsReady]).then(function(r) {
        translateData(r[0]);
        return r[0];
      });
    };
  }

  function addStyles(doc, community) {
    var css = "";
    if (lang === "zh-CN") {
      css += "body{--font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC'," +
        "'Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',Roboto,sans-serif;}";
    }
    if (!community) {
      css += "#panel-rating-section,#panel-footer{display:none !important;}";
    }
    css += "#i18n-language{white-space:nowrap;}";
    var style = doc.createElement("style");
    style.textContent = css;
    doc.head.appendChild(style);
  }

  function addLanguageToggle(doc) {
    var actions = doc.getElementById("header-actions");
    if (!actions || doc.getElementById("i18n-language")) return;
    var btn = doc.createElement("button");
    btn.id = "i18n-language";
    btn.type = "button";
    btn.setAttribute("data-i18n-skip", "");
    btn.textContent = lang === "zh-CN" ? "English" : "中文";
    btn.title = lang === "zh-CN" ? "Switch to English" : "切换到中文";
    btn.addEventListener("click", function() {
      setLanguage(lang === "zh-CN" ? "en" : "zh-CN");
      var loc = global.location;
      loc.href = loc.pathname + loc.search.replace(/([?&])lang=[\w-]+&?/, "$1").replace(/[?&]$/, "") + loc.hash;
    });
    actions.insertBefore(btn, actions.firstChild);
  }

  function addTranslationNote(doc) {
    var notes = doc.getElementById("notes-content");
    if (!notes || doc.getElementById("i18n-note")) return;
    var section = doc.createElement("div");
    section.id = "i18n-note";
    section.setAttribute("data-i18n-skip", "");
    var h3 = doc.createElement("h3");
    h3.textContent = "关于中文版";
    var p = doc.createElement("p");
    p.appendChild(doc.createTextNode(
      "本站是 OSINT Framework 的社区中文翻译版，与原作者无隶属关系。工具名称与链接保持原样，" +
      "分类与工具说明由 Claude 辅助翻译，难免有疏漏。原项目："));
    var upstream = doc.createElement("a");
    upstream.href = "https://github.com/lockfale/osint-framework";
    upstream.textContent = "lockfale/osint-framework";
    p.appendChild(upstream);
    p.appendChild(doc.createTextNode("；中文版及问题反馈："));
    var repo = doc.createElement("a");
    repo.href = "https://github.com/shadowhunter1024/osint-framework-chinese";
    repo.textContent = "shadowhunter1024/osint-framework-chinese";
    p.appendChild(repo);
    p.appendChild(doc.createTextNode("。"));
    section.appendChild(h3);
    section.appendChild(p);
    notes.insertBefore(section, notes.firstChild);
  }

  var lang = DEFAULT_LANGUAGE;

  function init() {
    var doc = global.document;
    lang = getLanguage();
    var community = communityApiAvailable();
    if (!community) disableCommunityApi();

    if (lang === "zh-CN") {
      doc.documentElement.lang = "zh-CN";
      var dictsReady = Promise.all([
        loadJson(DICT_BASE + "ui.json"),
        loadJson(DICT_BASE + "categories.json"),
        loadJson(DICT_BASE + "tools.json")
      ]).then(function(r) {
        setDictionaries(r[0], r[1], r[2]);
        doc.title = t(doc.title);
        translateDom(doc.body || doc.documentElement);
      });
      hookD3(dictsReady);
      observeDom(doc.documentElement);
    }

    var onReady = function() {
      addStyles(doc, community);
      addLanguageToggle(doc);
      if (lang === "zh-CN") addTranslationNote(doc);
    };
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }

  global.OsintI18n = {
    LANGUAGES: LANGUAGES,
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    TOOL_FIELDS: TOOL_FIELDS,
    setDictionaries: setDictionaries,
    lookupUi: lookupUi,
    t: t,
    translateData: translateData,
    searchText: searchText,
    translateDom: translateDom,
    getLanguage: function() { return lang; }
  };

  if (global.document && global.document.documentElement) init();
})(typeof window !== "undefined" ? window : globalThis);
