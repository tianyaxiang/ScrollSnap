// Internationalization Utilities

/**
 * Get localized message by key
 * @param {string} key - Message key from messages.json
 * @param {string} [fallback] - Fallback text if message not found
 * @returns {string} Localized message
 */
function getMessage(key, fallback = '') {
  const message = chrome.i18n.getMessage(key);
  return message || fallback;
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
 * Get current UI language
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
  const lang = getUILanguage();
  return lang.startsWith('zh');
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.i18n = {
    getMessage,
    applyI18nToDocument,
    getUILanguage,
    isChinese
  };
}
