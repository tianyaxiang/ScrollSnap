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
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function captureFullPage(tabId, format = 'png', quality = 92, onProgress = null) {
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

    // 显示进度指示器
    await sendMessageToTab(tabId, { action: 'showProgress', percent: 0 });

    // 先滚动到顶部并捕获第一张，获取实际图片尺寸
    await scrollToPosition(tabId, 0);
    await delay(300);
    
    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;
    
    const firstDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
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
    await sendMessageToTab(tabId, { action: 'updateProgress', percent: progress });

    // 继续捕获剩余部分
    for (let i = 1; i < totalScrolls; i++) {
      const scrollY = i * viewportHeight;
      const isLastScroll = i === totalScrolls - 1;
      
      // 滚动到指定位置
      await scrollToPosition(tabId, scrollY);
      
      // 等待页面渲染，并确保不超过 captureVisibleTab 的调用频率限制（每秒最多2次）
      await delay(550);
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
      
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
      await sendMessageToTab(tabId, { action: 'updateProgress', percent: prog });
    }

    // 恢复原始滚动位置
    await scrollToPosition(tabId, originalScrollY);
    
    // 隐藏进度指示器
    await sendMessageToTab(tabId, { action: 'hideProgress' });

    // 拼接截图
    const finalDataUrl = await stitchScreenshots(screenshots, captureWidth, totalHeight, captureViewportHeight, format, quality);
    
    return {
      success: true,
      dataUrl: finalDataUrl,
      dimensions: { width: Math.round(captureWidth / dpr), height: scrollHeight }
    };
  } catch (error) {
    console.error('Capture full page failed:', error);
    // 确保隐藏进度指示器
    try {
      await sendMessageToTab(tabId, { action: 'hideProgress' });
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
    // Content script可能未加载，忽略错误
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

  // 如果截图成功，通知popup显示预览
  if (result.success) {
    // 存储截图结果供popup使用
    await chrome.storage.local.set({ 
      lastCapture: {
        dataUrl: result.dataUrl,
        dimensions: result.dimensions,
        timestamp: Date.now()
      }
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
      return await captureFullPage(tab.id, params.format, params.quality);
    }

    case 'captureSelection': {
      // 选区截图由content script处理后回调
      const { rect, tabId } = params;
      return await captureSelectionArea(tabId || sender.tab?.id, rect, params.format, params.quality);
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
        params.format,
        params.quality,
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

    // 保存原始滚动位置
    const originalScroll = await getPageScrollPosition(tabId);

    // 选区信息（文档坐标，即相对于滚动内容的坐标）
    const selectionTop = rect.y;
    const selectionLeft = rect.x;
    const selectionWidth = rect.width;
    const selectionHeight = rect.height;

    // 确定有效的视口高度和容器偏移
    let effectiveViewportHeight = viewportHeight;
    let containerViewportTop = 0;
    let containerViewportLeft = 0;
    
    if (containerInfo) {
      effectiveViewportHeight = containerInfo.viewportHeight;
      containerViewportTop = containerInfo.viewportTop;
      containerViewportLeft = containerInfo.viewportLeft;
    }

    // 判断是否需要滚动截图
    const needsScrollCapture = selectionHeight > effectiveViewportHeight;

    const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png' };
    if (format === 'jpeg') captureOptions.quality = quality;

    if (!needsScrollCapture) {
      // 选区在单个视口内，直接截图裁剪
      // 获取当前页面滚动位置
      const currentScroll = await getPageScrollPosition(tabId);
      
      // 计算选区在当前视口中的位置（页面文档坐标转视口坐标）
      let cropX = selectionLeft - currentScroll.x;
      let cropY = selectionTop - currentScroll.y;

      console.log('[captureScrollSelection] single viewport - initial:', {
        selectionLeft, selectionTop, selectionWidth, selectionHeight,
        currentScroll,
        cropX, cropY,
        dpr
      });

      // 检查选区是否在当前视口内
      if (cropY < 0 || cropY + selectionHeight > viewportHeight ||
          cropX < 0 || cropX + selectionWidth > viewportWidth) {
        // 选区不完全在视口内，需要滚动页面
        const targetScrollY = Math.max(0, selectionTop - 50);
        const targetScrollX = Math.max(0, selectionLeft - 50);
        await scrollPageTo(tabId, targetScrollX, targetScrollY);
        await delay(300);
        
        // 重新获取滚动位置
        const actualScroll = await getPageScrollPosition(tabId);
        cropX = selectionLeft - actualScroll.x;
        cropY = selectionTop - actualScroll.y;

        console.log('[captureScrollSelection] single viewport - after scroll:', {
          targetScrollY, actualScroll,
          cropX, cropY
        });
      }
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
      
      const viewportRect = {
        x: cropX,
        y: cropY,
        width: selectionWidth,
        height: selectionHeight
      };

      const croppedDataUrl = await cropImage(dataUrl, viewportRect, format, quality, dpr);
      
      // 恢复滚动位置
      await scrollPageTo(tabId, originalScroll.x, originalScroll.y);

      return {
        success: true,
        dataUrl: croppedDataUrl,
        dimensions: { width: Math.round(selectionWidth), height: Math.round(selectionHeight) }
      };
    }

    // 需要滚动截图
    await sendMessageToTab(tabId, { action: 'showProgress', percent: 0 });

    const screenshots = [];
    let capturedHeight = 0;

    while (capturedHeight < selectionHeight) {
      // 计算当前需要捕获的高度
      const remainingHeight = selectionHeight - capturedHeight;
      const captureHeight = Math.min(viewportHeight, remainingHeight);
      
      // 计算滚动位置：让选区的当前部分出现在视口顶部
      const targetScrollY = selectionTop + capturedHeight;
      
      await scrollPageTo(tabId, 0, targetScrollY);
      await delay(550);

      // 获取实际滚动位置
      const actualScroll = await getPageScrollPosition(tabId);
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
      
      // 计算裁剪区域（页面文档坐标转视口坐标）
      const cropX = selectionLeft - actualScroll.x;
      const cropY = selectionTop + capturedHeight - actualScroll.y;

      console.log('[captureScrollSelection] scroll capture:', {
        iteration: screenshots.length,
        capturedHeight, captureHeight, selectionHeight,
        targetScrollY, actualScroll,
        cropX, cropY
      });
      
      const cropRect = {
        x: cropX,
        y: cropY,
        width: selectionWidth,
        height: captureHeight
      };

      const croppedDataUrl = await cropImage(dataUrl, cropRect, format, quality, dpr);
      
      screenshots.push({
        dataUrl: croppedDataUrl,
        y: capturedHeight * dpr,
        height: captureHeight * dpr
      });

      capturedHeight += captureHeight;

      // 更新进度
      const progress = Math.round((capturedHeight / selectionHeight) * 100);
      await sendMessageToTab(tabId, { action: 'updateProgress', percent: progress });
    }

    // 恢复滚动位置
    await scrollPageTo(tabId, originalScroll.x, originalScroll.y);
    await sendMessageToTab(tabId, { action: 'hideProgress' });

    // 拼接截图
    const finalWidth = Math.round(selectionWidth * dpr);
    const finalHeight = Math.round(selectionHeight * dpr);
    const finalDataUrl = await stitchSelectionScreenshots(screenshots, finalWidth, finalHeight, dpr, format, quality);

    return {
      success: true,
      dataUrl: finalDataUrl,
      dimensions: { width: Math.round(selectionWidth), height: Math.round(selectionHeight) }
    };
  } catch (error) {
    console.error('Capture scroll selection failed:', error);
    try {
      await sendMessageToTab(tabId, { action: 'hideProgress' });
    } catch (e) {}
    return { success: false, error: error.message };
  }
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

  for (const screenshot of screenshots) {
    const img = await createImageBitmap(await fetch(screenshot.dataUrl).then(r => r.blob()));
    // 使用记录的 y 位置，而不是简单累加
    ctx.drawImage(img, 0, screenshot.y);
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

  // 边界检查：确保裁剪区域在图片范围内
  if (srcX < 0) {
    srcW += srcX; // 减少宽度
    srcX = 0;
  }
  if (srcY < 0) {
    srcH += srcY; // 减少高度
    srcY = 0;
  }
  if (srcX + srcW > img.width) {
    srcW = img.width - srcX;
  }
  if (srcY + srcH > img.height) {
    srcH = img.height - srcY;
  }

  // 确保尺寸有效
  srcW = Math.max(1, srcW);
  srcH = Math.max(1, srcH);

  console.log('[cropImage] img:', img.width, 'x', img.height, 'crop:', srcX, srcY, srcW, srcH);

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
