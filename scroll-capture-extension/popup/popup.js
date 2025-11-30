// Popup UI Script

// ============================================
// State Management
// ============================================

const state = {
  isCapturing: false,
  previewDataUrl: null,
  previewDimensions: null,
  selectedFormat: 'png',
  jpegQuality: 92
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Panels
  mainMenu: document.getElementById('main-menu'),
  previewPanel: document.getElementById('preview-panel'),
  settingsPanel: document.getElementById('settings-panel'),
  progressOverlay: document.getElementById('progress-overlay'),
  errorToast: document.getElementById('error-toast'),
  
  // Capture buttons
  btnFullPage: document.getElementById('btn-full-page'),
  btnVisible: document.getElementById('btn-visible'),
  btnSelection: document.getElementById('btn-selection'),
  btnSettings: document.getElementById('btn-settings'),
  
  // Preview elements
  btnBack: document.getElementById('btn-back'),
  previewImage: document.getElementById('preview-image'),
  previewDimensions: document.getElementById('preview-dimensions'),
  formatSelect: document.getElementById('format-select'),
  btnSave: document.getElementById('btn-save'),
  btnCopy: document.getElementById('btn-copy'),
  
  // Settings elements
  btnSettingsBack: document.getElementById('btn-settings-back'),
  settingLanguage: document.getElementById('setting-language'),
  settingFormat: document.getElementById('setting-format'),
  settingQuality: document.getElementById('setting-quality'),
  qualityValue: document.getElementById('quality-value'),
  qualitySetting: document.getElementById('quality-setting'),
  
  // Guide elements
  guideOverlay: document.getElementById('guide-overlay'),
  btnGuideClose: document.getElementById('btn-guide-close'),
  
  // Progress elements
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  
  // Error elements
  errorMessage: document.getElementById('error-message')
};

// ============================================
// 4.1 UI Initialization
// ============================================

/**
 * Initialize popup UI
 */
async function init() {
  // 先初始化 i18n 系统
  if (window.i18n && window.i18n.initI18n) {
    await window.i18n.initI18n();
  }
  bindEvents();
  applyI18n();
  loadSettings();
  checkLastCapture();
  checkFirstInstall();
}

/**
 * Bind event listeners
 */
function bindEvents() {
  // Capture buttons
  elements.btnFullPage.addEventListener('click', () => startCapture('full'));
  elements.btnVisible.addEventListener('click', () => startCapture('visible'));
  elements.btnSelection.addEventListener('click', () => startCapture('selection'));
  elements.btnSettings.addEventListener('click', showSettingsPanel);
  
  // Preview actions
  elements.btnBack.addEventListener('click', showMainMenu);
  elements.btnSave.addEventListener('click', saveScreenshot);
  elements.btnCopy.addEventListener('click', copyScreenshot);
  elements.formatSelect.addEventListener('change', onFormatChange);
  
  // Settings actions
  elements.btnSettingsBack.addEventListener('click', showMainMenu);
  elements.settingLanguage.addEventListener('change', onLanguageChange);
  elements.settingFormat.addEventListener('change', onSettingFormatChange);
  elements.settingQuality.addEventListener('input', onQualityChange);
  
  // Guide actions
  elements.btnGuideClose.addEventListener('click', closeGuide);
}

/**
 * Apply internationalization
 */
function applyI18n() {
  // Use i18n utility if available
  if (window.i18n && window.i18n.applyI18nToDocument) {
    window.i18n.applyI18nToDocument();
  } else {
    // Fallback: apply text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.textContent = message;
      }
    });
    // Apply title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.setAttribute('title', message);
      }
    });
  }
}

/**
 * Load user settings
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get(['defaultFormat', 'jpegQuality', 'language']);
    
    // 加载语言设置，默认中文
    const language = settings.language || 'zh_CN';
    elements.settingLanguage.value = language;
    
    if (settings.defaultFormat) {
      state.selectedFormat = settings.defaultFormat;
      elements.formatSelect.value = settings.defaultFormat;
      elements.settingFormat.value = settings.defaultFormat;
      updateQualityVisibility(settings.defaultFormat);
    }
    if (settings.jpegQuality) {
      state.jpegQuality = settings.jpegQuality;
      elements.settingQuality.value = settings.jpegQuality;
      elements.qualityValue.textContent = `${settings.jpegQuality}%`;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Check for last capture result (from keyboard shortcut)
 */
async function checkLastCapture() {
  try {
    const data = await chrome.storage.local.get(['lastCapture']);
    if (data.lastCapture) {
      const { dataUrl, dimensions, timestamp } = data.lastCapture;
      // Only show if captured within last 5 seconds
      if (Date.now() - timestamp < 5000) {
        showPreview(dataUrl, dimensions);
        // Clear the stored capture
        await chrome.storage.local.remove(['lastCapture']);
      }
    }
  } catch (error) {
    console.error('Failed to check last capture:', error);
  }
}

/**
 * Check if this is first install and show guide
 */
async function checkFirstInstall() {
  try {
    const data = await chrome.storage.local.get(['showGuide']);
    if (data.showGuide) {
      showGuide();
    }
  } catch (error) {
    console.error('Failed to check first install:', error);
  }
}

/**
 * Show the first-time installation guide
 */
function showGuide() {
  elements.guideOverlay.classList.remove('hidden');
}

/**
 * Close the guide and mark as seen
 */
async function closeGuide() {
  elements.guideOverlay.classList.add('hidden');
  // Mark guide as seen
  try {
    await chrome.storage.local.set({ showGuide: false });
  } catch (error) {
    console.error('Failed to save guide state:', error);
  }
}

// ============================================
// 4.3 Capture Functions (Communication with Background)
// ============================================

/**
 * Start capture process
 * @param {string} mode - 'full' | 'visible' | 'selection'
 */
async function startCapture(mode) {
  if (state.isCapturing) return;
  
  state.isCapturing = true;
  setButtonsDisabled(true);
  
  try {
    if (mode === 'selection') {
      // Selection mode: close popup and let content script handle it
      await chrome.runtime.sendMessage({ action: 'startSelection' });
      window.close();
      return;
    }
    
    // Show progress for full page capture
    if (mode === 'full') {
      showProgress(0);
    }
    
    const action = mode === 'full' ? 'captureFullPage' : 'captureVisible';
    const result = await chrome.runtime.sendMessage({
      action,
      format: state.selectedFormat,
      quality: state.jpegQuality
    });
    
    hideProgress();
    
    if (result.success) {
      showPreview(result.dataUrl, result.dimensions);
    } else {
      showError(getErrorMessage(result.error));
    }
  } catch (error) {
    hideProgress();
    showError(getErrorMessage(error.message));
  } finally {
    state.isCapturing = false;
    setButtonsDisabled(false);
  }
}

/**
 * Save screenshot to downloads
 */
async function saveScreenshot() {
  if (!state.previewDataUrl) return;
  
  elements.btnSave.disabled = true;
  
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'download',
      dataUrl: state.previewDataUrl,
      format: state.selectedFormat
    });
    
    if (result.success) {
      showToast(getMessage('saveSuccess', '已保存'), 'success');
    } else {
      showError(getErrorMessage(result.error));
    }
  } catch (error) {
    showError(getErrorMessage(error.message));
  } finally {
    elements.btnSave.disabled = false;
  }
}

/**
 * Copy screenshot to clipboard
 * 直接在 popup 中执行复制，因为 popup 有焦点
 */
async function copyScreenshot() {
  if (!state.previewDataUrl) return;

  elements.btnCopy.disabled = true;

  try {
    // 将 dataUrl 转换为 blob
    const response = await fetch(state.previewDataUrl);
    const blob = await response.blob();

    // 确保是 PNG 格式
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      pngBlob = await convertToPng(state.previewDataUrl);
    }

    // 直接在 popup 中使用 Clipboard API
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);

    showToast(getMessage('copySuccess', '已复制到剪贴板'), 'success');
  } catch (error) {
    console.error('Copy failed:', error);
    showError(getErrorMessage(error.message));
  } finally {
    elements.btnCopy.disabled = false;
  }
}

/**
 * Convert image to PNG blob
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
async function convertToPng(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ============================================
// 4.2 Preview Panel Functions
// ============================================

/**
 * Show preview panel with screenshot
 * @param {string} dataUrl - Screenshot data URL
 * @param {object} dimensions - {width, height}
 */
function showPreview(dataUrl, dimensions) {
  state.previewDataUrl = dataUrl;
  state.previewDimensions = dimensions;
  
  elements.previewImage.src = dataUrl;
  
  if (dimensions) {
    elements.previewDimensions.textContent = `${dimensions.width} × ${dimensions.height}`;
  }
  
  elements.mainMenu.classList.add('hidden');
  elements.previewPanel.classList.remove('hidden');
}

/**
 * Show main menu
 */
function showMainMenu() {
  state.previewDataUrl = null;
  state.previewDimensions = null;
  
  elements.previewImage.src = '';
  elements.previewPanel.classList.add('hidden');
  elements.settingsPanel.classList.add('hidden');
  elements.mainMenu.classList.remove('hidden');
}

/**
 * Handle format change in preview panel
 */
function onFormatChange() {
  state.selectedFormat = elements.formatSelect.value;
  // Save preference
  chrome.storage.sync.set({ defaultFormat: state.selectedFormat });
  // Sync with settings panel
  elements.settingFormat.value = state.selectedFormat;
  updateQualityVisibility(state.selectedFormat);
}

// ============================================
// Settings Panel Functions
// ============================================

/**
 * Show settings panel
 */
function showSettingsPanel() {
  elements.mainMenu.classList.add('hidden');
  elements.previewPanel.classList.add('hidden');
  elements.settingsPanel.classList.remove('hidden');
}

/**
 * Handle format change in settings panel
 */
function onSettingFormatChange() {
  state.selectedFormat = elements.settingFormat.value;
  // Save preference
  chrome.storage.sync.set({ defaultFormat: state.selectedFormat });
  // Sync with preview panel
  elements.formatSelect.value = state.selectedFormat;
  updateQualityVisibility(state.selectedFormat);
}

/**
 * Handle JPEG quality change
 */
function onQualityChange() {
  const quality = parseInt(elements.settingQuality.value, 10);
  state.jpegQuality = quality;
  elements.qualityValue.textContent = `${quality}%`;
  // Save preference
  chrome.storage.sync.set({ jpegQuality: quality });
}

/**
 * Handle language change
 */
async function onLanguageChange() {
  const language = elements.settingLanguage.value;
  if (window.i18n && window.i18n.setLanguage) {
    await window.i18n.setLanguage(language);
    // 立即应用新语言
    applyI18n();
  } else {
    chrome.storage.sync.set({ language });
  }
}

/**
 * Update quality setting visibility based on format
 * @param {string} format - Selected format
 */
function updateQualityVisibility(format) {
  if (elements.qualitySetting) {
    elements.qualitySetting.style.display = format === 'jpeg' ? 'flex' : 'none';
  }
}

// ============================================
// Progress & Error UI
// ============================================

/**
 * Show progress overlay
 * @param {number} percent - Progress percentage (0-100)
 */
function showProgress(percent) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = `${percent}%`;
  elements.progressOverlay.classList.remove('hidden');
}

/**
 * Hide progress overlay
 */
function hideProgress() {
  elements.progressOverlay.classList.add('hidden');
}

/**
 * Update progress
 * @param {number} percent
 */
function updateProgress(percent) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = `${percent}%`;
}

/**
 * Show error toast
 * @param {string} message
 */
function showError(message) {
  showToast(message, 'error');
}

/**
 * Show toast notification
 * @param {string} message
 * @param {string} type - 'error' | 'success'
 */
function showToast(message, type = 'error') {
  elements.errorMessage.textContent = message;
  elements.errorToast.className = `toast ${type}`;
  elements.errorToast.classList.remove('hidden');
  
  setTimeout(() => {
    elements.errorToast.classList.add('hidden');
  }, 3000);
}

/**
 * Set all capture buttons disabled state
 * @param {boolean} disabled
 */
function setButtonsDisabled(disabled) {
  elements.btnFullPage.disabled = disabled;
  elements.btnVisible.disabled = disabled;
  elements.btnSelection.disabled = disabled;
}

/**
 * Get localized message
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function getMessage(key, fallback) {
  // 优先使用自定义 i18n 系统
  if (window.i18n && window.i18n.getMessage) {
    return window.i18n.getMessage(key, fallback);
  }
  const message = chrome.i18n.getMessage(key);
  return message || fallback;
}

/**
 * Get user-friendly error message
 * @param {string} errorCode
 * @returns {string}
 */
function getErrorMessage(errorCode) {
  const errorMessages = {
    'RESTRICTED_PAGE': getMessage('errorRestricted', '此页面不支持截图'),
    'NO_ACTIVE_TAB': getMessage('errorNoTab', '无法获取当前标签页'),
    'CANNOT_GET_SCROLL_INFO': getMessage('errorScrollInfo', '无法获取页面信息'),
    'UNKNOWN_ACTION': getMessage('errorUnknown', '未知操作')
  };
  
  return errorMessages[errorCode] || errorCode || getMessage('errorGeneric', '截图失败，请重试');
}

// ============================================
// Message Listener (for progress updates)
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'progressUpdate') {
    updateProgress(message.percent);
  }
  return false;
});

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', init);
