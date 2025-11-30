// Internationalization Utilities - Runtime Language Switching

// 语言包缓存
const messagesCache = {};

// 当前语言
let currentLanguage = 'zh_CN';

// 支持的语言列表
const SUPPORTED_LANGUAGES = ['zh_CN', 'en'];

/**
 * 加载语言包
 * @param {string} lang - 语言代码
 * @returns {Promise<object>} 语言包对象
 */
async function loadMessages(lang) {
  if (messagesCache[lang]) {
    return messagesCache[lang];
  }

  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    const messages = await response.json();
    messagesCache[lang] = messages;
    return messages;
  } catch (error) {
    console.error(`Failed to load messages for ${lang}:`, error);
    // 如果加载失败，尝试加载中文作为后备
    if (lang !== 'zh_CN') {
      return loadMessages('zh_CN');
    }
    return {};
  }
}

/**
 * 初始化 i18n 系统
 * @returns {Promise<void>}
 */
async function initI18n() {
  try {
    const result = await chrome.storage.sync.get(['language']);
    currentLanguage = result.language || 'zh_CN';
    await loadMessages(currentLanguage);
  } catch (error) {
    console.error('Failed to initialize i18n:', error);
    currentLanguage = 'zh_CN';
  }
}

/**
 * Get localized message by key
 * @param {string} key - Message key from messages.json
 * @param {string} [fallback] - Fallback text if message not found
 * @returns {string} Localized message
 */
function getMessage(key, fallback = '') {
  const messages = messagesCache[currentLanguage] || {};
  const entry = messages[key];
  return entry?.message || fallback;
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
    if (message) {
      el.textContent = message;
    }
  });

  // Apply title/tooltip attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = getMessage(key);
    if (message) {
      el.setAttribute('title', message);
    }
  });

  // Apply placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = getMessage(key);
    if (message) {
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
if (typeof window !== 'undefined') {
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
}
