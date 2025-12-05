// Internationalization Utilities - Runtime Language Switching

(function() {
  'use strict';

  // 语言包缓存
  const messagesCache = {};

  // 当前语言
  let currentLanguage = 'zh_CN';

  // 是否已初始化
  let isInitialized = false;

  // 支持的语言列表
  const SUPPORTED_LANGUAGES = ['zh_CN', 'en'];

  // 内嵌语言包（用于 content script 环境）
  const embeddedMessages = {
    zh_CN: {
      extName: { message: '滚动截屏' },
      extDescription: { message: '轻松截取网页滚动内容的 Chrome 扩展' },
      btnSave: { message: '保存' },
      btnCopy: { message: '复制' },
      saveSuccess: { message: '已保存' },
      copySuccess: { message: '已复制到剪贴板' },
      selectionHint: { message: '拖拽选择区域，可滚动页面扩展选区 | ESC 取消' },
      editorTitle: { message: '编辑截图' },
      editorUndo: { message: '撤销 (Ctrl+Z)' },
      editorRedo: { message: '重做 (Ctrl+Shift+Z)' },
      editorClose: { message: '关闭 (ESC)' },
      editorRect: { message: '矩形' },
      editorEllipse: { message: '椭圆' },
      editorArrow: { message: '箭头' },
      editorLine: { message: '直线' },
      editorPen: { message: '画笔' },
      editorMarker: { message: '马克笔' },
      editorText: { message: '文字' },
      editorMosaic: { message: '马赛克' },
      editorBlur: { message: '模糊' },
      editorTemplateShadow: { message: '阴影效果' },
      editorTemplateRounded: { message: '圆角效果' },
      editorTemplateBrowser: { message: '浏览器窗口' },
      editorTemplateGradient: { message: '渐变背景' },
      editorTemplatePolaroid: { message: '拍立得效果' },
      editorCopyTooltip: { message: '复制到剪贴板 (Ctrl+C)' },
      editorSaveTooltip: { message: '保存到本地 (Ctrl+S)' }
    },
    en: {
      extName: { message: 'Scroll Capture' },
      extDescription: { message: 'Easy scroll screenshot capture for Chrome' },
      btnSave: { message: 'Save' },
      btnCopy: { message: 'Copy' },
      saveSuccess: { message: 'Saved successfully' },
      copySuccess: { message: 'Copied to clipboard' },
      selectionHint: { message: 'Drag to select area, scroll to extend selection | ESC to cancel' },
      editorTitle: { message: 'Edit Screenshot' },
      editorUndo: { message: 'Undo (Ctrl+Z)' },
      editorRedo: { message: 'Redo (Ctrl+Shift+Z)' },
      editorClose: { message: 'Close (ESC)' },
      editorRect: { message: 'Rectangle' },
      editorEllipse: { message: 'Ellipse' },
      editorArrow: { message: 'Arrow' },
      editorLine: { message: 'Line' },
      editorPen: { message: 'Pen' },
      editorMarker: { message: 'Marker' },
      editorText: { message: 'Text' },
      editorMosaic: { message: 'Mosaic' },
      editorBlur: { message: 'Blur' },
      editorTemplateShadow: { message: 'Shadow Effect' },
      editorTemplateRounded: { message: 'Rounded Corners' },
      editorTemplateBrowser: { message: 'Browser Window' },
      editorTemplateGradient: { message: 'Gradient Background' },
      editorTemplatePolaroid: { message: 'Polaroid Style' },
      editorCopyTooltip: { message: 'Copy to clipboard (Ctrl+C)' },
      editorSaveTooltip: { message: 'Save to local (Ctrl+S)' }
    }
  };

  /**
   * 加载语言包
   * @param {string} lang - 语言代码
   * @returns {Promise<object>} 语言包对象
   */
  async function loadMessages(lang) {
    // 尝试通过 fetch 加载完整语言包（适用于 popup 环境）
    try {
      const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
      const response = await fetch(url);
      if (response.ok) {
        const messages = await response.json();
        messagesCache[lang] = messages;
        return messages;
      }
    } catch (error) {
      // fetch 失败，继续使用内嵌语言包
    }

    // 使用内嵌语言包
    if (embeddedMessages[lang]) {
      messagesCache[lang] = embeddedMessages[lang];
      return messagesCache[lang];
    }

    // 最后使用中文作为后备
    messagesCache[lang] = embeddedMessages.zh_CN;
    return messagesCache[lang];
  }

  /**
   * 初始化 i18n 系统
   * @returns {Promise<void>}
   */
  async function initI18n() {
    if (isInitialized) {
      return;
    }

    try {
      const result = await chrome.storage.sync.get(['language']);
      currentLanguage = result.language || 'zh_CN';
    } catch (error) {
      currentLanguage = 'zh_CN';
    }

    await loadMessages(currentLanguage);
    isInitialized = true;

    // 确保缓存中有数据，如果没有则使用内嵌语言包
    if (!messagesCache[currentLanguage] || Object.keys(messagesCache[currentLanguage]).length === 0) {
      messagesCache[currentLanguage] = embeddedMessages[currentLanguage] || embeddedMessages.zh_CN;
    }
  }

  /**
   * Get localized message by key
   * @param {string} key - Message key from messages.json
   * @param {string} [fallback] - Fallback text if message not found
   * @returns {string} Localized message
   */
  function getMessage(key, fallback) {
    // 确定要使用的语言（优先使用当前设置的语言，否则默认中文）
    const lang = currentLanguage || 'zh_CN';

    // 1. 首先尝试从当前语言的内嵌语言包获取（最可靠）
    if (embeddedMessages[lang] && embeddedMessages[lang][key] && embeddedMessages[lang][key].message) {
      return embeddedMessages[lang][key].message;
    }

    // 2. 尝试从缓存获取（可能从 fetch 加载）
    if (messagesCache[lang] && messagesCache[lang][key] && messagesCache[lang][key].message) {
      return messagesCache[lang][key].message;
    }

    // 3. 尝试从中文内嵌语言包获取（作为后备）
    if (embeddedMessages.zh_CN && embeddedMessages.zh_CN[key] && embeddedMessages.zh_CN[key].message) {
      return embeddedMessages.zh_CN[key].message;
    }

    // 4. 尝试从英文内嵌语言包获取
    if (embeddedMessages.en && embeddedMessages.en[key] && embeddedMessages.en[key].message) {
      return embeddedMessages.en[key].message;
    }

    // 5. 最后返回 fallback 或 key
    return fallback !== undefined ? fallback : key;
  }


  /**
   * Apply i18n to all elements with data-i18n attribute
   * Supports text content and attribute localization
   */
  function applyI18nToDocument() {
    // Apply text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = getMessage(key);
      if (message && message !== key) {
        el.textContent = message;
      }
    });

    // Apply title/tooltip attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = getMessage(key);
      if (message && message !== key) {
        el.setAttribute('title', message);
      }
    });

    // Apply placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const message = getMessage(key);
      if (message && message !== key) {
        el.setAttribute('placeholder', message);
      }
    });
  }

  /**
   * Get current language
   * @returns {string} Language code
   */
  function getCurrentLanguage() {
    return currentLanguage;
  }

  /**
   * Set current language and reload messages
   * @param {string} lang - Language code (e.g., 'zh_CN', 'en')
   * @returns {Promise<boolean>} Success status
   */
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      console.error(`Unsupported language: ${lang}`);
      return false;
    }

    try {
      await chrome.storage.sync.set({ language: lang });
      currentLanguage = lang;
      // 清除缓存以便重新加载
      delete messagesCache[lang];
      await loadMessages(lang);
      return true;
    } catch (error) {
      console.error('Failed to set language:', error);
      return false;
    }
  }

  /**
   * Get current UI language from browser
   * @returns {string} Language code (e.g., 'zh_CN', 'en')
   */
  function getUILanguage() {
    return chrome.i18n.getUILanguage();
  }

  /**
   * Check if current language is Chinese
   * @returns {boolean}
   */
  function isChinese() {
    return currentLanguage.startsWith('zh');
  }

  // Export for use in other scripts
  window.i18n = {
    initI18n,
    getMessage,
    applyI18nToDocument,
    getCurrentLanguage,
    setLanguage,
    getUILanguage,
    isChinese,
    SUPPORTED_LANGUAGES
  };

})();
