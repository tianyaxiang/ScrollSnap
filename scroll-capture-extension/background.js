// Background Service Worker for Scroll Capture Extension

// ============================================
// 2.1 可视区域截图功能
// ============================================

/**
 * 捕获当前可视区域截图
 * @param {number} tabId - 标签页ID
 * @param {string} format - 图片格式 ('png' | 'jpeg')
 * @param {number} quality - JPEG质量 (0-100)
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function captureVisibleArea(tabId, format = 'png', quality = 92) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    // 检查是否为受限页面
    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    const options = {
      format: format === 'jpeg' ? 'jpeg' : 'png'
    };
    
    if (format === 'jpeg') {
      options.quality = quality;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, options);
    
    return {
      success: true,
      dataUrl,
      dimensions: await getImageDimensions(dataUrl)
    };
  } catch (error) {
    console.error('Capture visible area failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 检查是否为受限页面
 * @param {string} url - 页面URL
 * @returns {boolean}
 */
function isRestrictedPage(url) {
  if (!url) return true;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file://'
  ];
  return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}


/**
 * 获取图片尺寸
 * Service Worker 中没有 Image 对象，使用 createImageBitmap
 * @param {string} dataUrl - 图片数据URL
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageDimensions(dataUrl) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);
    return { width: img.width, height: img.height };
  } catch (error) {
    console.error('Get image dimensions failed:', error);
    return { width: 0, height: 0 };
  }
}

// ============================================
// 2.2 全页滚动截图功能
// ============================================

/**
 * 捕获全页截图
 * @param {number} tabId - 标签页ID
 * @param {string} format - 图片格式
 * @param {number} quality - JPEG质量
 * @param {function} onProgress - 进度回调
 * @param {boolean} showPageProgress - 是否在页面上显示进度条（从popup调用时为false）
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function captureFullPage(tabId, format = 'png', quality = 92, onProgress = null, showPageProgress = true) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 注入content script获取页面信息
    const scrollInfo = await getScrollInfo(tabId);
    if (!scrollInfo) {
      return { success: false, error: 'CANNOT_GET_SCROLL_INFO' };
    }

    const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio } = scrollInfo;
    const dpr = devicePixelRatio || 1;

    // 保存原始滚动位置
    const originalScrollY = scrollInfo.currentScrollY;

    // 隐藏滚动条
    await hideScrollbar(tabId);

    // 显示进度指示器（仅当 showPageProgress 为 true 时）
    if (showPageProgress) {
      await sendMessageToTab(tabId, { action: 'showProgress', percent: 0 });
    }

    // 先滚动到顶部并捕获第一张，获取实际图片尺寸
    await scrollToPosition(tabId, 0);
    await delay(300);

    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;

    // 截图前隐藏进度条，截图后恢复
    if (showPageProgress) {
      await sendMessageToTab(tabId, { action: 'hideProgress' });
    }
    const firstDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
    if (showPageProgress) {
      await sendMessageToTab(tabId, { action: 'showProgress', percent: 0 });
    }
    const firstImgDimensions = await getImageDimensions(firstDataUrl);

    // 实际截图的尺寸（考虑 DPI）
    const captureWidth = firstImgDimensions.width;
    const captureViewportHeight = firstImgDimensions.height;

    // 计算总高度（按实际像素）
    const totalHeight = Math.ceil(scrollHeight * dpr);
    const totalScrolls = Math.ceil(scrollHeight / viewportHeight);

    const screenshots = [{
      dataUrl: firstDataUrl,
      y: 0,
      height: captureViewportHeight,
      isLast: totalScrolls === 1
    }];

    // 更新进度
    const progress = Math.round((1 / totalScrolls) * 100);
    if (onProgress) onProgress(progress);
    if (showPageProgress) {
      await sendMessageToTab(tabId, { action: 'updateProgress', percent: progress });
    }

    // 如果需要多次截图，隐藏 fixed/sticky 元素（第一屏已经截取，后续屏幕隐藏这些元素避免重复）
    if (totalScrolls > 1) {
      await hideFixedElements(tabId);
    }

    // 继续捕获剩余部分
    for (let i = 1; i < totalScrolls; i++) {
      const scrollY = i * viewportHeight;
      const isLastScroll = i === totalScrolls - 1;

      // 滚动到指定位置
      await scrollToPosition(tabId, scrollY);

      // 等待页面渲染，并确保不超过 captureVisibleTab 的调用频率限制（每秒最多2次）
      await delay(550);

      // 截图前隐藏进度条，截图后恢复
      if (showPageProgress) {
        await sendMessageToTab(tabId, { action: 'hideProgress' });
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
      if (showPageProgress) {
        await sendMessageToTab(tabId, { action: 'showProgress', percent: Math.round((i / totalScrolls) * 100) });
      }

      // 计算实际捕获高度（按实际像素）
      let captureHeight = captureViewportHeight;
      if (isLastScroll) {
        // 最后一张的实际高度
        captureHeight = totalHeight - (i * captureViewportHeight);
        if (captureHeight <= 0) captureHeight = captureViewportHeight;
      }

      screenshots.push({
        dataUrl,
        y: i * captureViewportHeight,
        height: captureHeight,
        isLast: isLastScroll
      });

      // 更新进度
      const prog = Math.round(((i + 1) / totalScrolls) * 100);
      if (onProgress) onProgress(prog);
      if (showPageProgress) {
        await sendMessageToTab(tabId, { action: 'updateProgress', percent: prog });
      }
    }

    // 恢复 fixed/sticky 元素的可见性
    if (totalScrolls > 1) {
      await restoreFixedElements(tabId);
    }

    // 恢复滚动条
    await restoreScrollbar(tabId);

    // 恢复原始滚动位置
    await scrollToPosition(tabId, originalScrollY);

    // 隐藏进度指示器
    if (showPageProgress) {
      await sendMessageToTab(tabId, { action: 'hideProgress' });
    }

    // 拼接截图
    const finalDataUrl = await stitchScreenshots(screenshots, captureWidth, totalHeight, captureViewportHeight, format, quality);

    return {
      success: true,
      dataUrl: finalDataUrl,
      dimensions: { width: Math.round(captureWidth / dpr), height: scrollHeight }
    };
  } catch (error) {
    console.error('Capture full page failed:', error);
    // 确保恢复 fixed/sticky 元素、滚动条和隐藏进度指示器
    try {
      await restoreFixedElements(tabId);
      await restoreScrollbar(tabId);
      if (showPageProgress) {
        await sendMessageToTab(tabId, { action: 'hideProgress' });
      }
    } catch (e) {}
    return { success: false, error: error.message };
  }
}

/**
 * 获取页面滚动信息
 * @param {number} tabId
 * @returns {Promise<object>}
 */
async function getScrollInfo(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollHeight: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ),
        scrollWidth: Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        currentScrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });
    return results[0]?.result;
  } catch (error) {
    console.error('Get scroll info failed:', error);
    return null;
  }
}

/**
 * 滚动到指定位置
 * @param {number} tabId
 * @param {number} y
 */
async function scrollToPosition(tabId, y) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollY) => {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    },
    args: [y]
  });
}

/**
 * 向标签页发送消息
 * @param {number} tabId
 * @param {object} message
 */
async function sendMessageToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Content script可能未加载，对于重要消息尝试注入后重试
    const importantActions = [
      'showPreview',
      'startSelection',
      'showBatchProgress',
      'showBatchResults',
      'hideBatchProgress',
      'showToast',
      'openEditor'
    ];
    if (importantActions.includes(message.action)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        await delay(100);
        await chrome.tabs.sendMessage(tabId, message);
      } catch (e) {
        console.error('Failed to inject content script:', e);
      }
    }
  }
}

/**
 * 延迟函数
 * @param {number} ms
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 隐藏页面中的 fixed/sticky 定位元素
 * 这些元素在滚动截图时会重复出现，需要在第一屏之后隐藏
 * @param {number} tabId
 */
async function hideFixedElements(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 存储被隐藏元素的原始样式，以便后续恢复
      window.__scrollCaptureHiddenElements = [];
      
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        // 跳过我们自己的截图 UI 元素
        if (el.id && el.id.startsWith('scroll-capture-')) continue;
        
        const style = window.getComputedStyle(el);
        const position = style.position;
        
        // 检测 fixed 和 sticky 定位的元素
        if (position === 'fixed' || position === 'sticky') {
          // 记录原始的 visibility 值
          window.__scrollCaptureHiddenElements.push({
            element: el,
            originalVisibility: el.style.visibility,
            originalDisplay: el.style.display
          });
          // 使用 visibility: hidden 而不是 display: none，保持布局不变
          el.style.visibility = 'hidden';
        }
      }
      
      console.log('[ScrollCapture] Hidden', window.__scrollCaptureHiddenElements.length, 'fixed/sticky elements');
    }
  });
}

/**
 * 恢复被隐藏的 fixed/sticky 定位元素
 * @param {number} tabId
 */
async function restoreFixedElements(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (!window.__scrollCaptureHiddenElements) return;

      for (const item of window.__scrollCaptureHiddenElements) {
        // 恢复原始的 visibility 值
        item.element.style.visibility = item.originalVisibility;
      }

      console.log('[ScrollCapture] Restored', window.__scrollCaptureHiddenElements.length, 'fixed/sticky elements');

      // 清理
      delete window.__scrollCaptureHiddenElements;
    }
  });
}

/**
 * 隐藏页面滚动条
 * @param {number} tabId
 */
async function hideScrollbar(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 保存原始样式
      window.__scrollCaptureOriginalOverflow = {
        htmlOverflow: document.documentElement.style.overflow,
        htmlOverflowY: document.documentElement.style.overflowY,
        bodyOverflow: document.body.style.overflow,
        bodyOverflowY: document.body.style.overflowY,
        htmlScrollbarWidth: document.documentElement.style.scrollbarWidth,
        bodyScrollbarWidth: document.body.style.scrollbarWidth
      };

      // 隐藏滚动条但保持可滚动
      // 方法1: 使用 scrollbar-width (Firefox, Chrome 121+)
      document.documentElement.style.scrollbarWidth = 'none';
      document.body.style.scrollbarWidth = 'none';

      // 方法2: 添加 CSS 样式隐藏 webkit 滚动条
      const style = document.createElement('style');
      style.id = '__scroll-capture-hide-scrollbar';
      style.textContent = `
        html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
        html, body { scrollbar-width: none !important; }
      `;
      document.head.appendChild(style);

      console.log('[ScrollCapture] Scrollbar hidden');
    }
  });
}

/**
 * 恢复页面滚动条
 * @param {number} tabId
 */
async function restoreScrollbar(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 移除注入的样式
      const style = document.getElementById('__scroll-capture-hide-scrollbar');
      if (style) style.remove();

      // 恢复原始样式
      if (window.__scrollCaptureOriginalOverflow) {
        const orig = window.__scrollCaptureOriginalOverflow;
        document.documentElement.style.overflow = orig.htmlOverflow;
        document.documentElement.style.overflowY = orig.htmlOverflowY;
        document.body.style.overflow = orig.bodyOverflow;
        document.body.style.overflowY = orig.bodyOverflowY;
        document.documentElement.style.scrollbarWidth = orig.htmlScrollbarWidth;
        document.body.style.scrollbarWidth = orig.bodyScrollbarWidth;
        delete window.__scrollCaptureOriginalOverflow;
      }

      console.log('[ScrollCapture] Scrollbar restored');
    }
  });
}


/**
 * 拼接多张截图
 * @param {Array} screenshots - 截图数组
 * @param {number} totalWidth - 总宽度（实际像素）
 * @param {number} totalHeight - 总高度（实际像素）
 * @param {number} captureViewportHeight - 每张截图的高度（实际像素）
 * @param {string} format - 输出格式
 * @param {number} quality - JPEG质量
 * @returns {Promise<string>} - 拼接后的dataUrl
 */
async function stitchScreenshots(screenshots, totalWidth, totalHeight, captureViewportHeight, format, quality) {
  // 创建离屏canvas
  const canvas = new OffscreenCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  for (const screenshot of screenshots) {
    const img = await createImageBitmap(await fetch(screenshot.dataUrl).then(r => r.blob()));
    
    if (screenshot.isLast && screenshots.length > 1) {
      // 最后一张截图，只取底部需要的部分
      const sourceY = img.height - screenshot.height;
      const destY = totalHeight - screenshot.height;
      ctx.drawImage(
        img,
        0, sourceY, img.width, screenshot.height,
        0, destY, totalWidth, screenshot.height
      );
    } else {
      ctx.drawImage(img, 0, screenshot.y);
    }
  }

  // 转换为blob
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob({ 
    type: mimeType, 
    quality: format === 'jpeg' ? quality / 100 : undefined 
  });
  
  // 转换为dataUrl
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// ============================================
// 2.3 图片保存和剪贴板功能
// ============================================

/**
 * 生成带时间戳的文件名
 * @param {string} format - 图片格式
 * @returns {string}
 */
function generateFilename(format = 'png') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `screenshot_${year}${month}${day}_${hours}${minutes}${seconds}.${format}`;
}

/**
 * 下载图片
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名（可选）
 * @param {string} format - 图片格式
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function downloadImage(dataUrl, filename = null, format = 'png') {
  try {
    const finalFilename = filename || generateFilename(format);
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: finalFilename,
      saveAs: false
    });
    
    return { success: true };
  } catch (error) {
    console.error('Download failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 复制图片到剪贴板
 * Service Worker 中无法直接使用 navigator.clipboard，通过 content script 执行
 * @param {string} dataUrl - 图片数据URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function copyToClipboard(dataUrl) {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || isRestrictedPage(tab.url)) {
      // 如果是受限页面，尝试使用 offscreen document
      return await copyViaOffscreen(dataUrl);
    }

    // 通过 content script 执行复制
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (imageDataUrl) => {
        try {
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();

          // 确保是 PNG 格式（剪贴板兼容性更好）
          let pngBlob = blob;
          if (blob.type !== 'image/png') {
            const img = document.createElement('img');
            img.src = imageDataUrl;
            await new Promise((resolve) => {
              img.onload = resolve;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          }

          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
      args: [dataUrl]
    });

    return results[0]?.result || { success: false, error: 'Script execution failed' };
  } catch (error) {
    console.error('Copy to clipboard failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 通过 offscreen document 复制（备用方案）
 */
async function copyViaOffscreen(dataUrl) {
  try {
    await setupOffscreenDocument();
    const result = await chrome.runtime.sendMessage({
      action: 'offscreenCopy',
      target: 'offscreen',
      dataUrl
    });
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 设置 offscreen document
 */
async function setupOffscreenDocument() {
  const offscreenUrl = 'offscreen.html';
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['CLIPBOARD'],
    justification: 'Copy screenshot image to clipboard'
  });
}

// ============================================
// 2.4 快捷键命令监听
// ============================================

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let result;
  
  switch (command) {
    case 'capture-full-page':
      result = await captureFullPage(tab.id);
      break;
    case 'capture-visible':
      result = await captureVisibleArea(tab.id);
      break;
    case 'capture-selection':
      // 触发选区截图模式
      await sendMessageToTab(tab.id, { action: 'startSelection' });
      return;
    default:
      return;
  }

  // 如果截图成功，显示预览
  if (result.success) {
    // 存储截图结果供popup使用
    await chrome.storage.local.set({ 
      lastCapture: {
        dataUrl: result.dataUrl,
        dimensions: result.dimensions,
        timestamp: Date.now()
      }
    });
    // 在页面上显示预览浮层
    await sendMessageToTab(tab.id, {
      action: 'showPreview',
      dataUrl: result.dataUrl,
      dimensions: result.dimensions
    });
  }
});


// ============================================
// 消息处理
// ============================================

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // 保持消息通道开放
});

/**
 * 处理消息
 * @param {object} message
 * @param {object} sender
 * @returns {Promise<object>}
 */
async function handleMessage(message, sender) {
  const { action, ...params } = message;

  switch (action) {
    case 'captureVisible': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: 'NO_ACTIVE_TAB' };
      return await captureVisibleArea(tab.id, params.format, params.quality);
    }

    case 'captureFullPage': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: 'NO_ACTIVE_TAB' };
      // 传递进度回调，向 popup 发送进度更新
      const onProgress = (percent) => {
        chrome.runtime.sendMessage({ action: 'progressUpdate', percent }).catch(() => {
          // popup 可能已关闭，忽略错误
        });
      };
      // 从 popup 调用时，不在页面上显示进度条（popup 有自己的进度条）
      return await captureFullPage(tab.id, params.format, params.quality, onProgress, false);
    }

    case 'captureSelection': {
      // 选区截图，支持 copy/download/edit 三种操作
      const tabId = params.tabId || sender.tab?.id;
      if (!tabId) return { success: false, error: 'NO_TAB_ID' };

      // 判断是新的带 operation 的调用还是旧的调用
      if (params.operation) {
        // 新的调用方式，带 operation 参数
        console.log('[captureSelection] Starting capture with operation:', params.operation);

        const result = await captureScrollSelection(
          tabId,
          params.rect,
          params.viewportHeight,
          params.viewportWidth,
          params.devicePixelRatio || 1,
          params.format || 'png',
          params.quality || 92,
          params.containerInfo,
          params.currentScroll
        );

        console.log('[captureSelection] Capture result:', result.success, result.error);

        if (result.success) {
          // 保存最后截图
          await chrome.storage.local.set({
            lastCapture: {
              dataUrl: result.dataUrl,
              dimensions: result.dimensions,
              timestamp: Date.now()
            }
          });

          // 根据操作类型执行不同动作
          switch (params.operation) {
            case 'copy':
              const copyResult = await copyToClipboard(result.dataUrl);
              console.log('[captureSelection] Copy result:', copyResult);
              if (copyResult.success) {
                await sendMessageToTab(tabId, { action: 'showToast', message: '已复制到剪贴板' });
              } else {
                await sendMessageToTab(tabId, { action: 'showToast', message: '复制失败' });
              }
              break;

            case 'download':
              await downloadImage(result.dataUrl, `screenshot_${Date.now()}.png`, params.format || 'png');
              await sendMessageToTab(tabId, { action: 'showToast', message: '已开始下载' });
              break;

            case 'edit':
              await sendMessageToTab(tabId, {
                action: 'openEditor',
                dataUrl: result.dataUrl,
                dimensions: result.dimensions
              });
              break;
          }
        }
        return result;
      } else {
        // 旧的调用方式，兼容 popup 调用
        const { rect } = params;
        return await captureSelectionArea(tabId, rect, params.format, params.quality);
      }
    }

    case 'download': {
      return await downloadImage(params.dataUrl, params.filename, params.format);
    }

    case 'copyToClipboard': {
      return await copyToClipboard(params.dataUrl);
    }

    case 'startSelection': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: 'NO_ACTIVE_TAB' };
      if (isRestrictedPage(tab.url)) {
        return { success: false, error: 'RESTRICTED_PAGE' };
      }
      
      // 先尝试发送消息，如果失败则注入 content script
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
      } catch (e) {
        // Content script 可能未加载，手动注入并执行
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // 等待脚本加载
        await delay(100);
        await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
      }
      return { success: true };
    }

    case 'batchCaptureTab': {
      // 批量截图单个标签页
      const { tabId, format, quality } = params;
      return await captureBatchTab(tabId, format, quality);
    }

    case 'batchCaptureAllTabs': {
      // 批量截图所有选中的标签页
      const { tabIds, format, quality } = params;
      return await batchCaptureAllTabs(tabIds, format, quality);
    }

    case 'startBatchCapture': {
      // 从 storage 读取任务信息并开始批量截图
      startBatchCaptureFromStorage();
      return { success: true };
    }

    case 'selectionComplete': {
      // 选区完成，捕获选区截图（旧版，视口内选区）
      const tabId = sender.tab?.id;
      if (!tabId) return { success: false, error: 'NO_TAB_ID' };
      const dpr = params.devicePixelRatio || 1;
      const result = await captureSelectionArea(tabId, params.rect, params.format, params.quality, dpr);
      if (result.success) {
        // 存储截图结果供popup使用
        await chrome.storage.local.set({
          lastCapture: {
            dataUrl: result.dataUrl,
            dimensions: result.dimensions,
            timestamp: Date.now()
          }
        });
        // 在页面上显示预览浮层
        await sendMessageToTab(tabId, {
          action: 'showPreview',
          dataUrl: result.dataUrl,
          dimensions: result.dimensions
        });
      }
      return result;
    }

    case 'scrollSelectionComplete': {
      // 滚动选区完成，捕获可能跨越多个视口的选区
      const tabId = sender.tab?.id;
      if (!tabId) return { success: false, error: 'NO_TAB_ID' };
      const result = await captureScrollSelection(
        tabId,
        params.rect,
        params.viewportHeight,
        params.viewportWidth,
        params.devicePixelRatio || 1,
        params.format || 'png',
        params.quality || 92,
        params.containerInfo,
        params.currentScroll // 传递当前滚动位置
      );
      if (result.success) {
        await chrome.storage.local.set({
          lastCapture: {
            dataUrl: result.dataUrl,
            dimensions: result.dimensions,
            timestamp: Date.now()
          }
        });
        await sendMessageToTab(tabId, {
          action: 'showPreview',
          dataUrl: result.dataUrl,
          dimensions: result.dimensions
        });
      }
      return result;
    }

    case 'selectionCancelled': {
      // 选区取消，无需处理
      return { success: true };
    }

    default:
      return { success: false, error: 'UNKNOWN_ACTION' };
  }
}

/**
 * 捕获滚动选区截图（支持跨越多个视口）
 * @param {number} tabId
 * @param {object} rect - 选区矩形（文档坐标）{x, y, width, height}
 * @param {number} viewportHeight - 视口高度
 * @param {number} viewportWidth - 视口宽度
 * @param {number} dpr - 设备像素比
 * @param {string} format
 * @param {number} quality
 * @param {object} containerInfo - 滚动容器信息（可选）
 * @param {object} initialScroll - 选区完成时的滚动位置（可选）
 * @returns {Promise<object>}
 */
async function captureScrollSelection(tabId, rect, viewportHeight, viewportWidth, dpr = 1, format = 'png', quality = 92, containerInfo = null, initialScroll = null) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 判断是否使用内部滚动容器
    const useContainer = containerInfo && containerInfo.scrollHeight > containerInfo.clientHeight;

    // 保存原始滚动位置
    const originalScroll = useContainer
      ? await getContainerScrollPosition(tabId)
      : await getPageScrollPosition(tabId);

    // 选区信息（文档坐标，即相对于滚动内容的坐标）
    const selectionTop = rect.y;
    const selectionLeft = rect.x;
    const selectionWidth = rect.width;
    const selectionHeight = rect.height;

    // 确定有效的视口高度和容器偏移
    let effectiveViewportHeight = viewportHeight;
    let effectiveViewportWidth = viewportWidth;
    let containerViewportTop = 0;
    let containerViewportLeft = 0;

    if (useContainer) {
      // 使用 clientHeight/clientWidth 而不是 viewportHeight/viewportWidth
      // 因为 clientHeight/clientWidth 不包含滚动条
      effectiveViewportHeight = containerInfo.clientHeight;
      effectiveViewportWidth = containerInfo.clientWidth;
      containerViewportTop = containerInfo.viewportTop;
      containerViewportLeft = containerInfo.viewportLeft;
    }

    // 判断是否需要滚动截图
    const needsScrollCapture = selectionHeight > effectiveViewportHeight;

    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;

    if (!needsScrollCapture) {
      // 选区在单个视口内，直接截图裁剪
      // 使用 content.js 传递的滚动位置，如果没有则重新获取
      const currentScroll = initialScroll || (useContainer 
        ? await getContainerScrollPosition(tabId)
        : await getPageScrollPosition(tabId));
      
      // 计算选区在当前视口中的位置
      let cropX, cropY;
      if (useContainer) {
        // 对于内部容器，选区坐标是相对于容器内容的
        // 需要转换为视口坐标：容器位置 + (选区位置 - 容器滚动位置)
        cropX = containerViewportLeft + (selectionLeft - currentScroll.x);
        cropY = containerViewportTop + (selectionTop - currentScroll.y);
      } else {
        cropX = selectionLeft - currentScroll.x;
        cropY = selectionTop - currentScroll.y;
      }

      console.log('[captureScrollSelection] single viewport - initial:', {
        selectionLeft, selectionTop, selectionWidth, selectionHeight,
        currentScroll, useContainer,
        containerViewportTop, containerViewportLeft,
        cropX, cropY,
        dpr
      });

      // 检查选区是否在当前视口内
      const needsScroll = useContainer
        ? (cropY < containerViewportTop || cropY + selectionHeight > containerViewportTop + effectiveViewportHeight)
        : (cropY < 0 || cropY + selectionHeight > viewportHeight || cropX < 0 || cropX + selectionWidth > viewportWidth);
      
      console.log('[captureScrollSelection] needsScroll check:', {
        needsScroll,
        cropY, cropX,
        selectionHeight, selectionWidth,
        viewportHeight, viewportWidth
      });
        
      if (needsScroll) {
        // 选区不完全在视口内，需要滚动
        const targetScrollY = Math.max(0, selectionTop - 50);
        const targetScrollX = Math.max(0, selectionLeft - 50);
        
        if (useContainer) {
          await scrollContainerTo(tabId, targetScrollX, targetScrollY);
        } else {
          await scrollPageTo(tabId, targetScrollX, targetScrollY);
        }
        await delay(300);
        
        // 重新获取滚动位置并计算裁剪坐标
        const actualScroll = useContainer 
          ? await getContainerScrollPosition(tabId)
          : await getPageScrollPosition(tabId);
          
        if (useContainer) {
          cropX = containerViewportLeft + (selectionLeft - actualScroll.x);
          cropY = containerViewportTop + (selectionTop - actualScroll.y);
        } else {
          cropX = selectionLeft - actualScroll.x;
          cropY = selectionTop - actualScroll.y;
        }

        console.log('[captureScrollSelection] single viewport - after scroll:', {
          targetScrollY, actualScroll,
          cropX, cropY
        });
      }
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);

      // 计算实际裁剪宽度，确保不超过容器可视区域（不包含滚动条）
      let actualCropWidth = selectionWidth;
      if (useContainer) {
        // 获取当前滚动位置用于计算
        const scrollForWidth = initialScroll || await getContainerScrollPosition(tabId);
        // 裁剪区域右边界不能超过容器的 clientWidth
        const maxCropRight = effectiveViewportWidth;
        const cropRight = (selectionLeft - scrollForWidth.x) + selectionWidth;
        if (cropRight > maxCropRight) {
          actualCropWidth = maxCropRight - (selectionLeft - scrollForWidth.x);
        }
      }

      const viewportRect = {
        x: cropX,
        y: cropY,
        width: actualCropWidth,
        height: selectionHeight
      };

      const croppedDataUrl = await cropImage(dataUrl, viewportRect, format, quality, dpr);

      // 恢复滚动位置
      if (useContainer) {
        await scrollContainerTo(tabId, originalScroll.x, originalScroll.y);
      } else {
        await scrollPageTo(tabId, originalScroll.x, originalScroll.y);
      }

      return {
        success: true,
        dataUrl: croppedDataUrl,
        dimensions: { width: Math.round(actualCropWidth), height: Math.round(selectionHeight) }
      };
    }

    // 需要滚动截图
    await sendMessageToTab(tabId, { action: 'showProgress', percent: 0 });

    // 选区截图时，所有屏幕都隐藏 fixed/sticky 元素
    await hideFixedElements(tabId);

    // 计算实际裁剪宽度（在开始滚动前计算，确保所有截图使用相同的宽度）
    let finalCropWidth = selectionWidth;
    if (useContainer) {
      // 选区宽度不能超过容器可视区域宽度（不包含滚动条）
      if (selectionWidth > effectiveViewportWidth) {
        finalCropWidth = effectiveViewportWidth;
      }
    }

    const screenshots = [];
    let capturedHeight = 0;
    
    // 使用有效视口高度作为每次捕获的步长
    const stepHeight = useContainer ? effectiveViewportHeight : viewportHeight;

    while (capturedHeight < selectionHeight) {
      // 计算当前需要捕获的高度
      const remainingHeight = selectionHeight - capturedHeight;
      const captureHeight = Math.min(stepHeight, remainingHeight);

      // 计算滚动位置：让选区的当前部分出现在容器/视口顶部
      const targetScrollY = selectionTop + capturedHeight;

      if (useContainer) {
        await scrollContainerTo(tabId, 0, targetScrollY);
      } else {
        await scrollPageTo(tabId, 0, targetScrollY);
      }
      await delay(550);

      // 获取实际滚动位置
      const actualScroll = useContainer
        ? await getContainerScrollPosition(tabId)
        : await getPageScrollPosition(tabId);

      // 截图前临时隐藏进度条（移出视口）
      await sendMessageToTab(tabId, { action: 'tempHideProgress' });
      await delay(30);

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);

      // 截图后恢复进度条
      await sendMessageToTab(tabId, { action: 'tempShowProgress' });

      // 计算裁剪区域
      // 关键：cropY 应该是选区当前部分在视口中的位置
      let cropX, cropY;
      if (useContainer) {
        // 对于内部容器：
        // 选区在容器内容中的位置是 selectionTop + capturedHeight
        // 容器滚动了 actualScroll.y
        // 所以选区在容器可视区域中的位置是 (selectionTop + capturedHeight) - actualScroll.y
        // 再加上容器在视口中的位置 containerViewportTop
        cropX = containerViewportLeft + (selectionLeft - actualScroll.x);
        cropY = containerViewportTop + ((selectionTop + capturedHeight) - actualScroll.y);
      } else {
        // 对于页面滚动：
        // 选区在文档中的位置是 selectionTop + capturedHeight
        // 页面滚动了 actualScroll.y
        // 所以选区在视口中的位置是 (selectionTop + capturedHeight) - actualScroll.y
        cropX = selectionLeft - actualScroll.x;
        cropY = (selectionTop + capturedHeight) - actualScroll.y;
      }

      console.log('[captureScrollSelection] scroll capture:', {
        iteration: screenshots.length,
        capturedHeight, captureHeight, selectionHeight,
        targetScrollY, actualScroll,
        useContainer, containerViewportTop,
        cropX, cropY,
        stepHeight
      });

      // 确保 cropY 不为负数（可能由于滚动不精确）
      if (cropY < 0) {
        console.warn('[captureScrollSelection] cropY is negative, adjusting');
        cropY = 0;
      }

      // 计算实际裁剪宽度，确保不超过容器可视区域（不包含滚动条）
      let actualCropWidth = finalCropWidth;
      if (useContainer) {
        // 裁剪区域右边界不能超过容器的 clientWidth
        const maxCropRight = effectiveViewportWidth;
        const cropRight = (selectionLeft - actualScroll.x) + finalCropWidth;
        if (cropRight > maxCropRight) {
          actualCropWidth = maxCropRight - (selectionLeft - actualScroll.x);
        }
      }
      
      const cropRect = {
        x: cropX,
        y: cropY,
        width: actualCropWidth,
        height: captureHeight
      };

      const croppedDataUrl = await cropImage(dataUrl, cropRect, format, quality, dpr);

      screenshots.push({
        dataUrl: croppedDataUrl,
        y: capturedHeight * dpr,
        height: captureHeight * dpr
      });

      capturedHeight += captureHeight;

      // 更新进度（进度条已在截图后显示，这里更新百分比）
      const finalProgress = Math.round((capturedHeight / selectionHeight) * 100);
      await sendMessageToTab(tabId, { action: 'updateProgress', percent: finalProgress });
    }

    // 恢复 fixed/sticky 元素的可见性
    await restoreFixedElements(tabId);

    // 恢复滚动位置
    if (useContainer) {
      await scrollContainerTo(tabId, originalScroll.x, originalScroll.y);
    } else {
      await scrollPageTo(tabId, originalScroll.x, originalScroll.y);
    }
    await sendMessageToTab(tabId, { action: 'hideProgress' });

    // 拼接截图
    const finalWidth = Math.round(finalCropWidth * dpr);
    const finalHeight = Math.round(selectionHeight * dpr);
    const finalDataUrl = await stitchSelectionScreenshots(screenshots, finalWidth, finalHeight, dpr, format, quality);

    return {
      success: true,
      dataUrl: finalDataUrl,
      dimensions: { width: Math.round(finalCropWidth), height: Math.round(selectionHeight) }
    };
  } catch (error) {
    console.error('Capture scroll selection failed:', error);
    try {
      await restoreFixedElements(tabId);
      await sendMessageToTab(tabId, { action: 'hideProgress' });
    } catch (e) {}
    return { success: false, error: error.message };
  }
}

/**
 * 查找可滚动容器的通用函数（在页面上下文中执行）
 */
function findScrollableContainerScript() {
  const commonSelectors = [
    '[data-is-streaming]',
    'main[class*="overflow"]',
    'div[class*="overflow-y-auto"]',
    'div[class*="overflow-auto"]',
    '[role="main"]',
    'main',
    '.main-content',
    '#main-content',
    '.chat-messages',
    '.messages-container',
    '.conversation',
  ];

  function isScrollable(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10;
  }

  // 首先尝试常见选择器
  for (const selector of commonSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (isScrollable(el)) {
          return el;
        }
      }
    } catch (e) {}
  }

  // 如果没找到，遍历查找最大的可滚动容器
  const allElements = document.querySelectorAll('div, main, section, article');
  let bestContainer = null;
  let bestScore = 0;

  for (const el of allElements) {
    if (isScrollable(el)) {
      const rect = el.getBoundingClientRect();
      const visibleArea = rect.width * rect.height;
      const viewportArea = window.innerWidth * window.innerHeight;
      const areaRatio = visibleArea / viewportArea;
      const scrollableHeight = el.scrollHeight - el.clientHeight;
      
      if (areaRatio > 0.3 && scrollableHeight > 100) {
        const score = scrollableHeight * areaRatio;
        if (score > bestScore) {
          bestScore = score;
          bestContainer = el;
        }
      }
    }
  }

  return bestContainer;
}

/**
 * 获取内部滚动容器的滚动位置
 */
async function getContainerScrollPosition(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // 内联容器查找逻辑
        const commonSelectors = [
          '[data-is-streaming]',
          'main[class*="overflow"]',
          'div[class*="overflow-y-auto"]',
          'div[class*="overflow-auto"]',
          '[role="main"]',
          'main',
          '.main-content',
          '#main-content',
          '.chat-messages',
          '.messages-container',
          '.conversation',
        ];

        function isScrollable(el) {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10;
        }

        // 首先尝试常见选择器
        for (const selector of commonSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              if (isScrollable(el)) {
                return { x: el.scrollLeft, y: el.scrollTop };
              }
            }
          } catch (e) {}
        }

        // 如果没找到，遍历查找最大的可滚动容器
        const allElements = document.querySelectorAll('div, main, section, article');
        let bestContainer = null;
        let bestScore = 0;

        for (const el of allElements) {
          if (isScrollable(el)) {
            const rect = el.getBoundingClientRect();
            const visibleArea = rect.width * rect.height;
            const viewportArea = window.innerWidth * window.innerHeight;
            const areaRatio = visibleArea / viewportArea;
            const scrollableHeight = el.scrollHeight - el.clientHeight;
            
            if (areaRatio > 0.3 && scrollableHeight > 100) {
              const score = scrollableHeight * areaRatio;
              if (score > bestScore) {
                bestScore = score;
                bestContainer = el;
              }
            }
          }
        }

        if (bestContainer) {
          return { x: bestContainer.scrollLeft, y: bestContainer.scrollTop };
        }

        return { x: window.scrollX, y: window.scrollY };
      }
    });
    return results[0]?.result || { x: 0, y: 0 };
  } catch (error) {
    return { x: 0, y: 0 };
  }
}

/**
 * 滚动内部容器到指定位置
 */
async function scrollContainerTo(tabId, x, y) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX, scrollY) => {
      // 内联容器查找逻辑
      const commonSelectors = [
        '[data-is-streaming]',
        'main[class*="overflow"]',
        'div[class*="overflow-y-auto"]',
        'div[class*="overflow-auto"]',
        '[role="main"]',
        'main',
        '.main-content',
        '#main-content',
        '.chat-messages',
        '.messages-container',
        '.conversation',
      ];

      function isScrollable(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10;
      }

      // 首先尝试常见选择器
      for (const selector of commonSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (isScrollable(el)) {
              el.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
              return;
            }
          }
        } catch (e) {}
      }

      // 如果没找到，遍历查找最大的可滚动容器
      const allElements = document.querySelectorAll('div, main, section, article');
      let bestContainer = null;
      let bestScore = 0;

      for (const el of allElements) {
        if (isScrollable(el)) {
          const rect = el.getBoundingClientRect();
          const visibleArea = rect.width * rect.height;
          const viewportArea = window.innerWidth * window.innerHeight;
          const areaRatio = visibleArea / viewportArea;
          const scrollableHeight = el.scrollHeight - el.clientHeight;
          
          if (areaRatio > 0.3 && scrollableHeight > 100) {
            const score = scrollableHeight * areaRatio;
            if (score > bestScore) {
              bestScore = score;
              bestContainer = el;
            }
          }
        }
      }

      if (bestContainer) {
        bestContainer.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
        return;
      }

      // 如果没找到容器，回退到 window 滚动
      window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
    },
    args: [x, y]
  });
}

/**
 * 获取滚动位置（支持容器）
 */
async function getScrollPosition(tabId, useContainer = false) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (useContainer) => {
        if (useContainer) {
          // 尝试找到滚动容器
          const commonSelectors = [
            '[data-is-streaming]',
            'main[class*="overflow"]',
            'div[class*="overflow-y-auto"]',
            'div[class*="overflow-auto"]',
            '[role="main"]',
            'main'
          ];
          for (const selector of commonSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const style = window.getComputedStyle(el);
                const overflowY = style.overflowY;
                if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10) {
                  return { x: el.scrollLeft, y: el.scrollTop };
                }
              }
            } catch (e) {}
          }
        }
        return { x: window.scrollX, y: window.scrollY };
      },
      args: [useContainer]
    });
    return results[0]?.result || { x: 0, y: 0 };
  } catch (error) {
    return { x: 0, y: 0 };
  }
}

/**
 * 获取页面滚动位置（只获取 window 滚动，不考虑容器）
 */
async function getPageScrollPosition(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ x: window.scrollX, y: window.scrollY })
    });
    return results[0]?.result || { x: 0, y: 0 };
  } catch (error) {
    return { x: 0, y: 0 };
  }
}

/**
 * 滚动页面到指定位置（只滚动 window，不考虑容器）
 */
async function scrollPageTo(tabId, x, y) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX, scrollY) => {
      window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
    },
    args: [x, y]
  });
}

/**
 * 滚动到指定位置（支持容器）
 */
async function scrollToPositionEx(tabId, y, useContainer = false) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollY, useContainer) => {
      if (useContainer) {
        // 尝试找到滚动容器
        const commonSelectors = [
          '[data-is-streaming]',
          'main[class*="overflow"]',
          'div[class*="overflow-y-auto"]',
          'div[class*="overflow-auto"]',
          '[role="main"]',
          'main'
        ];
        for (const selector of commonSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const style = window.getComputedStyle(el);
              const overflowY = style.overflowY;
              if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10) {
                el.scrollTo({ top: scrollY, behavior: 'instant' });
                return;
              }
            }
          } catch (e) {}
        }
      }
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    },
    args: [y, useContainer]
  });
}

/**
 * 拼接选区截图
 */
async function stitchSelectionScreenshots(screenshots, totalWidth, totalHeight, dpr, format, quality) {
  const canvas = new OffscreenCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  let currentY = 0;
  for (const screenshot of screenshots) {
    const img = await createImageBitmap(await fetch(screenshot.dataUrl).then(r => r.blob()));
    console.log('[stitchSelectionScreenshots] drawing at y:', currentY, 'img size:', img.width, 'x', img.height);
    // 使用实际图片高度来计算下一个位置，而不是预期高度
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === 'jpeg' ? quality / 100 : undefined
  });

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * 捕获选区截图
 * @param {number} tabId
 * @param {object} rect - 选区矩形 {x, y, width, height}
 * @param {string} format
 * @param {number} quality
 * @param {number} dpr - 设备像素比
 * @returns {Promise<object>}
 */
async function captureSelectionArea(tabId, rect, format = 'png', quality = 92, dpr = 1) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 先捕获整个可视区域
    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;

    const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);

    // 裁剪选区，传入设备像素比
    const croppedDataUrl = await cropImage(fullDataUrl, rect, format, quality, dpr);

    return {
      success: true,
      dataUrl: croppedDataUrl,
      dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) }
    };
  } catch (error) {
    console.error('Capture selection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 裁剪图片
 * @param {string} dataUrl
 * @param {object} rect
 * @param {string} format
 * @param {number} quality
 * @param {number} dpr - 设备像素比
 * @returns {Promise<string>}
 */
async function cropImage(dataUrl, rect, format, quality, dpr = 1) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const img = await createImageBitmap(blob);

  // 使用设备像素比计算实际像素坐标
  let srcX = Math.round(rect.x * dpr);
  let srcY = Math.round(rect.y * dpr);
  let srcW = Math.round(rect.width * dpr);
  let srcH = Math.round(rect.height * dpr);

  console.log('[cropImage] input rect:', rect, 'dpr:', dpr);
  console.log('[cropImage] img:', img.width, 'x', img.height, 'initial crop:', srcX, srcY, srcW, srcH);

  // 边界检查：确保裁剪区域在图片范围内
  // 首先检查起点是否超出范围
  if (srcX >= img.width) {
    console.warn('[cropImage] srcX out of bounds, clamping to', img.width - srcW);
    srcX = Math.max(0, img.width - srcW);
  }
  if (srcY >= img.height) {
    console.warn('[cropImage] srcY out of bounds, clamping to', img.height - srcH);
    srcY = Math.max(0, img.height - srcH);
  }
  
  // 处理负坐标
  if (srcX < 0) {
    srcW += srcX; // 减少宽度
    srcX = 0;
  }
  if (srcY < 0) {
    srcH += srcY; // 减少高度
    srcY = 0;
  }
  
  // 确保不超出右边界和下边界
  if (srcX + srcW > img.width) {
    srcW = img.width - srcX;
  }
  if (srcY + srcH > img.height) {
    srcH = img.height - srcY;
  }

  // 确保尺寸有效
  srcW = Math.max(1, srcW);
  srcH = Math.max(1, srcH);
  srcX = Math.max(0, Math.min(srcX, img.width - 1));
  srcY = Math.max(0, Math.min(srcY, img.height - 1));

  console.log('[cropImage] final crop:', srcX, srcY, srcW, srcH);

  const canvas = new OffscreenCanvas(srcW, srcH);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const resultBlob = await canvas.convertToBlob({ 
    type: mimeType, 
    quality: format === 'jpeg' ? quality / 100 : undefined 
  });
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(resultBlob);
  });
}

// ============================================
// 批量标签页截图功能
// ============================================

/**
 * 从 storage 读取任务信息并开始批量截图
 */
async function startBatchCaptureFromStorage() {
  console.log('[BatchCapture] Starting batch capture from storage...');
  try {
    const data = await chrome.storage.local.get(['batchCaptureTask']);
    const task = data.batchCaptureTask;
    
    console.log('[BatchCapture] Task data:', task);
    
    if (!task || !task.tabIds || task.tabIds.length === 0) {
      console.error('[BatchCapture] No batch capture task found');
      return;
    }
    
    const { tabIds, tabInfoMap, format, quality, originalTabId, captureMode } = task;
    
    // 清除任务
    await chrome.storage.local.remove(['batchCaptureTask']);
    
    console.log('[BatchCapture] Original tab ID:', originalTabId, 'Mode:', captureMode);
    
    // 执行批量截图，传入进度回调和截图模式
    const result = await batchCaptureAllTabs(tabIds, format, quality, tabInfoMap, originalTabId, captureMode);
    
    // 准备结果数据用于预览
    const resultsForPreview = [];
    for (const tabId of tabIds) {
      const tabResult = result.results[tabId];
      const tabInfo = tabInfoMap[tabId] || {};
      resultsForPreview.push({
        tabId,
        title: tabInfo.title || '',
        url: tabInfo.url || '',
        success: tabResult?.success || false,
        dataUrl: tabResult?.dataUrl || null,
        dimensions: tabResult?.dimensions || null,
        error: tabResult?.error || null
      });
    }
    
    // 在原始标签页显示结果预览
    console.log(`[BatchCapture] Showing results on tab ${originalTabId}`);
    if (originalTabId) {
      try {
        await chrome.tabs.update(originalTabId, { active: true });
        await delay(300);
        console.log(`[BatchCapture] Sending showBatchResults message`);
        await sendMessageToTab(originalTabId, {
          action: 'showBatchResults',
          results: resultsForPreview,
          format: format
        });
        console.log(`[BatchCapture] Results panel should be visible now`);
      } catch (e) {
        console.error('[BatchCapture] Failed to show batch results:', e);
      }
    }
    
    console.log(`[BatchCapture] Batch capture complete: ${resultsForPreview.filter(r => r.success).length} succeeded`);
  } catch (error) {
    console.error('Batch capture from storage failed:', error);
  }
}

/**
 * 批量截图所有选中的标签页
 * @param {number[]} tabIds - 标签页ID数组
 * @param {string} format - 图片格式
 * @param {number} quality - JPEG质量
 * @param {object} tabInfoMap - 标签页信息映射
 * @param {number} progressTabId - 显示进度的标签页ID
 * @returns {Promise<object>}
 */
async function batchCaptureAllTabs(tabIds, format = 'png', quality = 92, tabInfoMap = {}, progressTabId = null, captureMode = 'full') {
  const results = {};
  const total = tabIds.length;
  
  for (let i = 0; i < tabIds.length; i++) {
    const tabId = tabIds[i];
    
    try {
      // 在截图前，在目标标签页显示进度
      const result = await captureBatchTabWithProgress(tabId, format, quality, i + 1, total, captureMode);
      results[tabId] = result;
    } catch (error) {
      results[tabId] = { success: false, error: error.message };
    }
  }
  
  return { success: true, results };
}

/**
 * 带进度显示的单个标签页截图
 */
async function captureBatchTabWithProgress(tabId, format, quality, current, total, captureMode = 'full') {
  console.log(`[BatchCapture] Capturing tab ${tabId} (${current}/${total}) mode: ${captureMode}`);
  try {
    const tab = await chrome.tabs.get(tabId);
    console.log(`[BatchCapture] Tab URL: ${tab.url}`);
    
    if (isRestrictedPage(tab.url)) {
      console.log(`[BatchCapture] Tab ${tabId} is restricted`);
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 激活标签页
    console.log(`[BatchCapture] Activating tab ${tabId}`);
    await chrome.tabs.update(tabId, { active: true });
    await delay(300);
    
    // 在当前标签页显示进度
    console.log(`[BatchCapture] Showing progress on tab ${tabId}`);
    try {
      await sendMessageToTab(tabId, {
        action: 'showBatchProgress',
        current: current,
        total: total,
        status: 'capturing'
      });
    } catch (e) {
      console.error(`[BatchCapture] Failed to show progress:`, e);
    }

    // 根据模式执行不同的截图
    let result;
    if (captureMode === 'visible') {
      console.log(`[BatchCapture] Starting visible area capture for tab ${tabId}`);
      result = await captureVisibleArea(tabId, format, quality);
    } else {
      console.log(`[BatchCapture] Starting full page capture for tab ${tabId}`);
      result = await captureFullPageForBatch(tabId, format, quality);
    }
    console.log(`[BatchCapture] Capture result for tab ${tabId}:`, result.success);
    
    // 隐藏进度
    try {
      await sendMessageToTab(tabId, { action: 'hideBatchProgress' });
    } catch (e) {}
    
    return result;
  } catch (error) {
    console.error(`[BatchCapture] Batch capture tab ${tabId} failed:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 批量截图单个标签页（全页截图）
 * @param {number} tabId - 标签页ID
 * @param {string} format - 图片格式
 * @param {number} quality - JPEG质量
 * @returns {Promise<object>}
 */
async function captureBatchTab(tabId, format = 'png', quality = 92) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 激活标签页以便截图
    const currentTab = await chrome.tabs.query({ active: true, currentWindow: true });
    const wasActive = currentTab[0]?.id === tabId;
    
    if (!wasActive) {
      await chrome.tabs.update(tabId, { active: true });
      // 等待标签页激活和渲染
      await delay(500);
    }

    // 执行全页截图
    const result = await captureFullPageForBatch(tabId, format, quality);
    
    return result;
  } catch (error) {
    console.error('Batch capture tab failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 为批量截图优化的全页截图函数
 * 不显示进度条，减少UI干扰
 */
async function captureFullPageForBatch(tabId, format = 'png', quality = 92) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (isRestrictedPage(tab.url)) {
      return { success: false, error: 'RESTRICTED_PAGE' };
    }

    // 获取页面滚动信息
    const scrollInfo = await getScrollInfo(tabId);
    if (!scrollInfo) {
      return { success: false, error: 'CANNOT_GET_SCROLL_INFO' };
    }

    const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio } = scrollInfo;
    const dpr = devicePixelRatio || 1;

    // 保存原始滚动位置
    const originalScrollY = scrollInfo.currentScrollY;

    // 隐藏滚动条
    await hideScrollbar(tabId);

    // 先滚动到顶部并捕获第一张
    await scrollToPosition(tabId, 0);
    await delay(300);

    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;

    const firstDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
    const firstImgDimensions = await getImageDimensions(firstDataUrl);

    const captureWidth = firstImgDimensions.width;
    const captureViewportHeight = firstImgDimensions.height;
    const totalHeight = Math.ceil(scrollHeight * dpr);
    const totalScrolls = Math.ceil(scrollHeight / viewportHeight);

    const screenshots = [{
      dataUrl: firstDataUrl,
      y: 0,
      height: captureViewportHeight,
      isLast: totalScrolls === 1
    }];

    // 如果需要多次截图，隐藏 fixed/sticky 元素
    if (totalScrolls > 1) {
      await hideFixedElements(tabId);
    }

    // 继续捕获剩余部分
    for (let i = 1; i < totalScrolls; i++) {
      const scrollY = i * viewportHeight;
      const isLastScroll = i === totalScrolls - 1;

      await scrollToPosition(tabId, scrollY);
      await delay(550);

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);

      let captureHeight = captureViewportHeight;
      if (isLastScroll) {
        captureHeight = totalHeight - (i * captureViewportHeight);
        if (captureHeight <= 0) captureHeight = captureViewportHeight;
      }

      screenshots.push({
        dataUrl,
        y: i * captureViewportHeight,
        height: captureHeight,
        isLast: isLastScroll
      });
    }

    // 恢复 fixed/sticky 元素
    if (totalScrolls > 1) {
      await restoreFixedElements(tabId);
    }

    // 恢复滚动条
    await restoreScrollbar(tabId);

    // 恢复原始滚动位置
    await scrollToPosition(tabId, originalScrollY);

    // 拼接截图
    const finalDataUrl = await stitchScreenshots(screenshots, captureWidth, totalHeight, captureViewportHeight, format, quality);

    return {
      success: true,
      dataUrl: finalDataUrl,
      dimensions: { width: Math.round(captureWidth / dpr), height: scrollHeight }
    };
  } catch (error) {
    console.error('Capture full page for batch failed:', error);
    try {
      await restoreFixedElements(tabId);
      await restoreScrollbar(tabId);
    } catch (e) {}
    return { success: false, error: error.message };
  }
}

// ============================================
// 扩展安装/更新时的处理
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装，设置默认配置并标记需要显示引导
    chrome.storage.sync.set({
      defaultFormat: 'png',
      jpegQuality: 92
    });
    // 使用 local storage 存储首次安装标记（只显示一次）
    chrome.storage.local.set({
      showGuide: true,
      installTime: Date.now()
    });
  }
});
