# OSINT Framework 中文版

[![在线使用](https://img.shields.io/badge/在线使用-GitHub%20Pages-blue)](https://shadowhunter1024.github.io/osint-framework-chinese/)
[![部署状态](https://github.com/shadowhunter1024/osint-framework-chinese/actions/workflows/zh-CN-pages.yml/badge.svg)](https://github.com/shadowhunter1024/osint-framework-chinese/actions/workflows/zh-CN-pages.yml)

[OSINT Framework](https://osintframework.com)（[lockfale/osint-framework](https://github.com/lockfale/osint-framework)）的社区中文翻译版：一棵按调查对象分类的开源情报（OSINT）工具导航树，收录 1000 多个免费或部分免费的工具与资源。

> 本项目是非官方翻译版，与原作者无隶属关系。工具名称与链接保持原样，分类与工具说明由 Claude 辅助翻译，欢迎指正。

## 在线使用

**https://shadowhunter1024.github.io/osint-framework-chinese/**

- 点击分类节点展开 / 收起，点击工具打开详情面板（简介、适用场景、输入 → 输出、操作安全说明）。
- 顶部搜索框支持中文和英文（例如“邮箱”“以图搜图”或 “whois”）。
- 右上角 **English** 按钮可切换回英文原版界面，选择会保存在浏览器中。

## 中文版做了什么

| 内容 | 状态 |
|---|---|
| 全部分类名称（200 多个） | 已翻译 |
| 全部工具的简介、适用场景、输入、输出、操作安全说明 | 已翻译 |
| 界面文字、图例、说明页、提示 | 已翻译 |
| 工具名称、URL、搜索语法（`site:` 等） | 保持原样 |

由于 GitHub Pages 是静态托管，原站的社区评分、报告问题与点击统计（依赖官方 Cloudflare Worker 接口）在中文版中隐藏。中文版不收集任何访问数据。

## 图例

- **(T)**：需要在本地安装运行的工具
- **(D)**：Google Dork（搜索语法），详见 [Google Hacking](https://en.wikipedia.org/wiki/Google_hacking)
- **(R)**：需要注册
- **(M)**：URL 中包含搜索词，需要手动修改 URL 本身

## 本地运行

```bash
git clone https://github.com/shadowhunter1024/osint-framework-chinese.git
cd osint-framework-chinese/public
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

页面需要通过 HTTP 访问，直接双击 `index.html` 无法加载数据。

## 反馈

- 翻译错误、中文版问题：[提交 issue](https://github.com/shadowhunter1024/osint-framework-chinese/issues)
- 新增工具、失效链接：请提交到[原项目](https://github.com/lockfale/osint-framework)，中文版会定期同步

维护与同步方法见 [I18N.md](../I18N.md)。

## 许可证

原项目使用 [MIT 许可证](../LICENSE)，版权归 Justin Nordine 所有；中文翻译部分同样以 MIT 许可证发布。

## 免责声明

本导航仅收录公开资源，用于合法的安全研究、调查与学习。使用者应遵守所在地法律法规及各网站的服务条款，自行承担使用后果。
