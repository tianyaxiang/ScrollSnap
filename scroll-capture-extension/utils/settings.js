// User Settings Management Utilities

/**
 * Default user settings
 */
const DEFAULT_SETTINGS = {
  defaultFormat: 'png',
  jpegQuality: 92,
  showGuideOnInstall: true
};

/**
 * Get all user settings
 * @returns {Promise<object>} User settings object
 */
async function getSettings() {
  try {
    const settings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @returns {Promise<any>} Setting value
 */
async function getSetting(key) {
  try {
    const result = await chrome.storage.sync.get([key]);
    return result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key];
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    return DEFAULT_SETTINGS[key];
  }
}

/**
 * Save a single setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Promise<boolean>} Success status
 */
async function saveSetting(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
    return true;
  } catch (error) {
    console.error(`Failed to save setting ${key}:`, error);
    return false;
  }
}

/**
 * Save multiple settings
 * @param {object} settings - Settings object
 * @returns {Promise<boolean>} Success status
 */
async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set(settings);
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

/**
 * Reset all settings to defaults
 * @returns {Promise<boolean>} Success status
 */
async function resetSettings() {
  try {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    return true;
  } catch (error) {
    console.error('Failed to reset settings:', error);
    return false;
  }
}

/**
 * Initialize settings on first install
 * @returns {Promise<void>}
 */
async function initializeSettings() {
  const settings = await chrome.storage.sync.get(['defaultFormat']);
  if (settings.defaultFormat === undefined) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.settings = {
    DEFAULT_SETTINGS,
    getSettings,
    getSetting,
    saveSetting,
    saveSettings,
    resetSettings,
    initializeSettings
  };
}
