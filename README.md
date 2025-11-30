# ScrollSnap 滚动截屏

一款轻松截取网页滚动内容的 Chrome 扩展。

## 功能特性

- **全页截图** - 自动滚动捕获整个页面
- **可视区域截图** - 快速截取当前屏幕
- **选区截图** - 自由选择截图区域
- **批量标签截图** - 一次性截取多个标签页（最多50个）
  - 支持全页截图和可视区域截图两种模式
  - 自动过滤受限页面（chrome://、扩展页面等）
  - 截图完成后弹窗预览，支持批量下载
- **多格式支持** - PNG / JPEG
- **快捷操作** - 保存到本地或复制到剪贴板
- **国际化** - 支持中文和英文

## 快捷键

| 功能 | 快捷键 |
|------|--------|
| 全页截图 | `Alt+Shift+S` |
| 可视区域截图 | `Alt+Shift+V` |
| 选区截图 | `Alt+Shift+A` |

## 安装

1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `scroll-capture-extension` 文件夹

## 项目结构

```
scroll-capture-extension/
├── _locales/           # 国际化语言文件
│   ├── en/
│   └── zh_CN/
├── icons/              # 扩展图标
├── popup/              # 弹出窗口 UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── utils/              # 工具模块
│   ├── i18n.js         # 国际化
│   ├── image-processor.js  # 图片处理
│   └── settings.js     # 设置管理
├── background.js       # Service Worker
├── content.js          # 内容脚本
└── manifest.json       # 扩展配置
```

## 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Chrome APIs: activeTab, scripting, storage, downloads, clipboardWrite

## License

MIT
