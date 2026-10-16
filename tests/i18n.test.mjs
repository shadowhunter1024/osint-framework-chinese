/**
 * 汉化测试：node --test tests/
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PATHS, check, collectData, extractCodeStrings, extractHtmlStrings, qualityIssues, uiCovered } from "../scripts/i18n-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

/** 在没有 DOM 的沙箱中加载 i18n.js，取得纯函数 API。 */
function loadI18n() {
    const sandbox = {};
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "public/i18n/i18n.js"), "utf8"), sandbox);
    return sandbox.OsintI18n;
}

test("界面词典：精确匹配、模式匹配与英文回退", () => {
    const i18n = loadI18n();
    i18n.setDictionaries({"Notes": "说明", "Open {0} ↗": "打开 {0} ↗", "No results found for “{0}”": "未找到与“{0}”相关的结果"}, {}, {});
    assert.equal(i18n.t("Notes"), "说明");
    assert.equal(i18n.t("  Notes \n"), "说明");
    assert.equal(i18n.t("Open Shodan ↗"), "打开 Shodan ↗");
    assert.equal(i18n.t("No results found for “abc”"), "未找到与“abc”相关的结果");
    assert.equal(i18n.t("Something new"), "Something new");
    assert.equal(i18n.lookupUi("Something new"), null);
});

test("界面词典：原型链上的键不会被当作译文", () => {
    const i18n = loadI18n();
    i18n.setDictionaries(JSON.parse("{\"__proto__\": \"x\"}"), {}, {});
    assert.equal(i18n.lookupUi("constructor"), null);
    assert.equal(i18n.lookupUi("toString"), null);
    assert.equal(i18n.t("hasOwnProperty"), "hasOwnProperty");
});

test("数据翻译：只替换分类名与工具说明，工具名、URL 与取值保持不变", () => {
    const i18n = loadI18n();
    i18n.setDictionaries({}, {"OSINT Framework": "OSINT 框架", "Username": "用户名"}, {
        "Finds usernames.": "查找用户名。",
        "Username": "用户名",
    });
    const data = {
        name: "OSINT Framework", type: "folder", children: [
            {name: "Username", type: "folder", children: [
                {name: "Tool (T)", type: "url", url: "https://example.com/", description: "Finds usernames.",
                    input: "Username", output: "Untranslated output", status: "live", opsec: "passive", pricing: "free"},
            ]},
        ],
    };
    i18n.translateData(data);
    const tool = data.children[0].children[0];
    assert.equal(data.name, "OSINT 框架");
    assert.equal(data.children[0].name, "用户名");
    assert.equal(tool.name, "Tool (T)");
    assert.equal(tool.url, "https://example.com/");
    assert.equal(tool.description, "查找用户名。");
    assert.equal(tool.input, "用户名");
    assert.equal(tool.output, "Untranslated output");
    assert.equal(tool.status, "live");
    assert.equal(tool.opsec, "passive");
    assert.equal(tool.pricing, "free");
    assert.equal(i18n.searchText(tool), "Finds usernames.");
    // _en 不可枚举，不影响 JSON 序列化
    assert.ok(!JSON.stringify(data).includes("_en"));
});

test("数据翻译：与工具同名的说明不会改动工具名", () => {
    const i18n = loadI18n();
    i18n.setDictionaries({}, {}, {"Shodan": "不应出现"});
    const data = {name: "root", children: [{name: "Shodan", url: "https://shodan.io", description: "x"}]};
    i18n.translateData(data);
    assert.equal(data.children[0].name, "Shodan");
});

test("检查脚本：提取 index.html 与 arf.js 中的界面文字", () => {
    const html = extractHtmlStrings("<title>OSINT Framework</title><body><button aria-label=\"Close panel\">&#x2715;</button>" +
        "<span>Input &rarr; Output</span><script>var x = \"Not this\";</script><!-- Nor this --></body>");
    assert.ok(html.includes("Close panel"));
    assert.ok(html.includes("Input → Output"));
    assert.ok(!html.includes("Not this"));
    assert.ok(!html.includes("Nor this"));
    const js = extractCodeStrings("el.textContent = \"No ratings yet\";\nvar a = \"ignored\";\n" +
        "x.innerHTML = '<div class=\"search-no-results\">No results found for \\u201c' + q;\n");
    assert.ok(js.includes("No ratings yet"));
    assert.ok(js.includes("No results found for “"));
    assert.ok(!js.includes("ignored"));
});

test("检查脚本：模式键覆盖拼接出的字符串", () => {
    const ui = {"No results found for “{0}”": "x", "Rate {0} stars": "y"};
    assert.ok(uiCovered("No results found for “", ui));
    assert.ok(uiCovered("Rate 2.5 stars", ui));
    assert.ok(!uiCovered("Rate", ui));
});

test("检查脚本：译文丢失 URL 或搜索语法时报错", () => {
    const issues = qualityIssues({
        "See https://example.com/a for details.": "详见示例网站。",
        "Use site:example.com to search.": "使用 site:example.com 搜索。",
        "Empty": " ",
    });
    assert.equal(issues.length, 2);
    assert.ok(issues.some(i => i.problem.includes("https://example.com/a")));
    assert.ok(issues.some(i => i.problem === "译文为空"));
});

test("词典文件：合法 JSON，值均为非空字符串", () => {
    for (const file of [PATHS.ui, PATHS.categories, PATHS.tools]) {
        const dict = readJson(file);
        for (const [k, v] of Object.entries(dict)) {
            assert.equal(typeof v, "string", `${path.basename(file)}: ${k}`);
            assert.ok(v.trim(), `${path.basename(file)}: ${k} 为空`);
        }
    }
});

test("词典覆盖：当前 arf.json 的分类、界面文字全部翻译，且没有质量问题", () => {
    const result = check();
    assert.deepEqual(result.categories.missing, []);
    assert.deepEqual(result.ui.missing, []);
    assert.deepEqual(result.quality, []);
});

test("arf.json 结构：collectData 能找到分类与工具字段", () => {
    const {categories, tools} = collectData(readJson(PATHS.data));
    assert.ok(categories.has("OSINT Framework"));
    assert.ok(categories.size > 100);
    assert.ok(tools.size > 1000);
});

test("DOM 翻译：译文与原文相同时不写回（避免 MutationObserver 死循环）", () => {
    const i18n = loadI18n();
    i18n.setDictionaries({"Google Hacking": "Google Hacking", "Notes": "说明"}, {}, {});
    let writes = 0;
    const makeText = value => {
        const node = {nodeType: 3, parentElement: null};
        let v = value;
        Object.defineProperty(node, "nodeValue", {get: () => v, set: x => { writes++; v = x; }});
        return node;
    };
    const same = makeText("Google Hacking");
    i18n.translateDom(same);
    assert.equal(writes, 0);
    const notes = makeText(" Notes ");
    i18n.translateDom(notes);
    assert.equal(notes.nodeValue, " 说明 ");
    assert.equal(writes, 1);
});
