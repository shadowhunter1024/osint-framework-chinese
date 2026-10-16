#!/usr/bin/env node
/**
 * 汉化检查：对比 public/arf.json、index.html、arf.js 与 public/i18n/zh-CN/ 下的词典，
 * 报告缺失 / 过期的译文以及译文质量问题（URL、搜索语法被改动等）。
 *
 * 用法：
 *   node scripts/i18n-check.mjs                    报告
 *   node scripts/i18n-check.mjs --verbose          列出每一条缺失 / 过期条目
 *   node scripts/i18n-check.mjs --strict           有缺失、过期或质量问题时以退出码 1 结束
 *   node scripts/i18n-check.mjs --template <file>  把缺失条目写成待翻译模板（JSON）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PATHS = {
    data: path.join(ROOT, "public/arf.json"),
    html: path.join(ROOT, "public/index.html"),
    js: path.join(ROOT, "public/js/arf.js"),
    ui: path.join(ROOT, "public/i18n/zh-CN/ui.json"),
    categories: path.join(ROOT, "public/i18n/zh-CN/categories.json"),
    tools: path.join(ROOT, "public/i18n/zh-CN/tools.json"),
};

export const TOOL_FIELDS = ["description", "bestFor", "input", "output", "opsecNote"];

// 程序取值或无需翻译的界面文字
const UI_IGNORE = new Set(["OSINT Framework", "T", "D", "R", "M", "0", "API", "NSFW", "…", "✕", "★", "↗"]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalise(str) {
    return String(str).replace(/\s+/g, " ").trim();
}

function decodeEntities(str) {
    const named = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", rarr: "→", rsaquo: "›", hellip: "…", nbsp: " "};
    return str
        .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

function decodeJsString(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\(["'\\])/g, "$1");
}

/** 收集 arf.json 中需要翻译的分类名与工具字段（按出现顺序，去重）。 */
export function collectData(data) {
    const categories = new Map();
    const tools = new Map();
    const stack = [{node: data, trail: []}];
    while (stack.length) {
        const {node, trail} = stack.shift();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.children) && !node.url && typeof node.name === "string") {
            if (!categories.has(node.name)) categories.set(node.name, trail.join(" > "));
        }
        if (node.url) {
            for (const field of TOOL_FIELDS) {
                const value = node[field];
                if (typeof value === "string" && value.trim() && !tools.has(value)) {
                    tools.set(value, {field, tool: node.name, category: trail.slice(1).join(" > ")});
                }
            }
        }
        for (const child of node.children ?? []) {
            stack.push({node: child, trail: [...trail, node.name]});
        }
    }
    return {categories, tools};
}

/** 从 index.html 提取文本节点与提示属性。 */
export function extractHtmlStrings(html) {
    const out = new Set();
    const body = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "");
    for (const m of body.matchAll(/\b(?:title|placeholder|aria-label)="([^"]*)"/g)) {
        out.add(normalise(decodeEntities(m[1])));
    }
    const titleTag = /<title>([^<]*)<\/title>/i.exec(html);
    if (titleTag) out.add(normalise(decodeEntities(titleTag[1])));
    for (const part of body.split(/<[^>]*>/)) {
        out.add(normalise(decodeEntities(part)));
    }
    return [...out].filter(s => /[A-Za-z]/.test(s) && !UI_IGNORE.has(s) && !/^(?:@|https?:)/.test(s));
}

/** 从 arf.js 提取写入界面的字符串字面量（textContent、徽章、提示等）。 */
export function extractCodeStrings(js) {
    const out = new Set();
    const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const line of code.split("\n")) {
        if (!/textContent|innerHTML|badge-pill|regionLabel\s*=|title=/.test(line)) continue;
        for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
            let s = decodeJsString(m[1] ?? m[2]);
            // HTML 片段里的可见文字
            if (/[<>]/.test(s)) {
                s.split(/<[^>]*>?|[<>]/).forEach(p => out.add(normalise(decodeEntities(p))));
                continue;
            }
            out.add(normalise(decodeEntities(s)));
        }
    }
    return [...out].filter(s => /[A-Za-z]{2}/.test(s) && !/^[\w-]+$/.test(s) && !/="/.test(s) && !UI_IGNORE.has(s) &&
        !/^(?:badge|panel|search|star|opsec|rating)-/.test(s) && !/[#.][\w-]+$/.test(s));
}

/** 判断一个界面字符串是否已被精确键或 {0} 模式键覆盖。 */
export function uiCovered(str, ui) {
    if (Object.hasOwn(ui, str)) return true;
    return Object.keys(ui).some(key => {
        if (!/\{\d\}/.test(key)) return false;
        // 代码里拼接出的模式前缀（如 "No results found for “" + query + "”"）
        if (key.startsWith(str) && /^\{\d\}/.test(key.slice(str.length))) return true;
        const re = new RegExp("^" + key.split(/\{\d\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+?") + "$");
        return re.test(str);
    });
}

const PROTECTED_TOKENS = [
    /https?:\/\/[^\s)"'，。]+/g,
    /\b(?:site|inurl|intitle|intext|filetype|ext|allinurl|allintitle|cache|related):\S+/g,
];

/** 质量检查：译文为空、未翻译、URL / 搜索语法丢失。 */
export function qualityIssues(dict) {
    const issues = [];
    for (const [en, zh] of Object.entries(dict)) {
        if (typeof zh !== "string" || !zh.trim()) {
            issues.push({en, problem: "译文为空"});
            continue;
        }
        for (const re of PROTECTED_TOKENS) {
            for (const token of en.match(re) ?? []) {
                if (!zh.includes(token.replace(/[.,;:)\]]+$/, ""))) issues.push({en, problem: `译文缺少 ${token}`});
            }
        }
    }
    return issues;
}

function compare(expected, dict) {
    const missing = [...expected.keys()].filter(k => !Object.hasOwn(dict, k) || !String(dict[k]).trim());
    const stale = Object.keys(dict).filter(k => !k.startsWith("_") && !expected.has(k));
    return {total: expected.size, translated: expected.size - missing.length, missing, stale};
}

export function check() {
    const data = readJson(PATHS.data);
    const {categories, tools} = collectData(data);
    const dictCategories = readJson(PATHS.categories);
    const dictTools = readJson(PATHS.tools);
    const ui = readJson(PATHS.ui);

    const uiStrings = new Map();
    for (const s of extractHtmlStrings(fs.readFileSync(PATHS.html, "utf8"))) uiStrings.set(s, "index.html");
    for (const s of extractCodeStrings(fs.readFileSync(PATHS.js, "utf8"))) if (!uiStrings.has(s)) uiStrings.set(s, "arf.js");
    const uiMissing = [...uiStrings.keys()].filter(s => !uiCovered(s, ui));

    return {
        categories: compare(categories, dictCategories),
        tools: compare(tools, dictTools),
        toolInfo: tools,
        categoryInfo: categories,
        ui: {total: uiStrings.size, translated: uiStrings.size - uiMissing.length, missing: uiMissing, stale: []},
        uiInfo: uiStrings,
        quality: [...qualityIssues(dictTools), ...qualityIssues(dictCategories), ...qualityIssues(ui)],
    };
}

function pct(r) {
    return r.total ? (100 * r.translated / r.total).toFixed(1) + "%" : "-";
}

export function buildTemplate(result) {
    const template = {categories: {}, tools: {}, ui: {}};
    for (const k of result.categories.missing) template.categories[k] = "";
    for (const k of result.tools.missing) {
        const info = result.toolInfo.get(k);
        template.tools[k] = "";
        template.tools["_context:" + k] = `${info.tool} · ${info.field} · ${info.category}`;
    }
    for (const k of result.ui.missing) template.ui[k] = "";
    return template;
}

export function main(argv = process.argv.slice(2)) {
    const verbose = argv.includes("--verbose");
    const strict = argv.includes("--strict");
    const tIdx = argv.indexOf("--template");
    const result = check();

    console.log("OSINT Framework 汉化检查");
    for (const [label, key] of [["分类", "categories"], ["工具说明", "tools"], ["界面文字", "ui"]]) {
        const r = result[key];
        console.log(`  ${label}：${r.translated}/${r.total}（${pct(r)}），缺失 ${r.missing.length}，过期 ${r.stale.length}`);
        if (verbose || r.missing.length <= 10) r.missing.forEach(m => console.log(`    + 缺失：${m}`));
        if (verbose || r.stale.length <= 10) r.stale.forEach(m => console.log(`    - 过期：${m}`));
    }
    console.log(`  质量问题：${result.quality.length}`);
    result.quality.slice(0, verbose ? Infinity : 20).forEach(q => console.log(`    ! ${q.problem}：${q.en}`));

    if (tIdx !== -1) {
        const file = argv[tIdx + 1];
        if (!file) throw new Error("--template 需要输出文件路径");
        fs.writeFileSync(file, JSON.stringify(buildTemplate(result), null, 2) + "\n");
        console.log(`  已写出待翻译模板：${file}`);
    }

    const bad = result.categories.missing.length + result.tools.missing.length + result.ui.missing.length +
        result.categories.stale.length + result.tools.stale.length + result.quality.length;
    if (strict && bad) process.exitCode = 1;
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
