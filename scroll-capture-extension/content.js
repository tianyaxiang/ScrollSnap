// Content Script for Scroll Capture Extension

(function() {
  'use strict';

  // ============================================
  // 3.1 页面滚动信息获取和控制
  // ============================================

  /**
   * 获取页面滚动信息
   * @returns {ScrollInfo} 滚动信息对象
   */
  function getScrollInfo() {
    const body = document.body;
    const html = document.documentElement;
    
    return {
      scrollHeight: Math.max(
        body.scrollHeight, html.scrollHeight,
        body.offsetHeight, html.offsetHeight,
        body.clientHeight, html.clientHeight
      ),
      scrollWidth: Math.max(
        body.scrollWidth, html.scrollWidth,
        body.offsetWidth, html.offsetWidth,
        body.clientWidth, html.clientWidth
      ),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      currentScrollY: window.scrollY || window.pageYOffset,
      currentScrollX: window.scrollX || window.pageXOffset
    };
  }

  /**
   * 平滑滚动到指定位置
   * @param {number} y - 目标Y坐标
   * @returns {Promise<void>}
   */
  async function scrollToPosition(y) {
    return new Promise((resolve) => {
      window.scrollTo({
        top: y,
        left: 0,
        behavior: 'instant'
      });
      // 等待滚动完成
      setTimeout(resolve, 100);
    });
  }


  // ============================================
  // 3.2 选区截图交互
  // ============================================

  let selectionOverlay = null;
  let selectionBox = null;
  let selectionInfo = null;
  let isSelecting = false;
  let startX = 0;
  let startY = 0;

  /**
   * 创建选区覆盖层 UI
   */
  function createSelectionOverlay() {
    // 移除已存在的覆盖层
    removeSelectionOverlay();

    // 创建覆盖层
    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'scroll-capture-overlay';
    selectionOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 2147483646;
    `;

    // 创建选区框
    selectionBox = document.createElement('div');
    selectionBox.id = 'scroll-capture-selection';
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px dashed #4a90d9;
      background: rgba(74, 144, 217, 0.1);
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `;

    // 创建尺寸信息显示
    selectionInfo = document.createElement('div');
    selectionInfo.id = 'scroll-capture-info';
    selectionInfo.style.cssText = `
      position: fixed;
      background: #4a90d9;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `;

    document.body.appendChild(selectionOverlay);
    document.body.appendChild(selectionBox);
    document.body.appendChild(selectionInfo);

    // 绑定事件
    selectionOverlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    return selectionOverlay;
  }

  /**
   * 移除选区覆盖层
   */
  function removeSelectionOverlay() {
    if (selectionOverlay) {
      selectionOverlay.removeEventListener('mousedown', onMouseDown);
      selectionOverlay.remove();
      selectionOverlay = null;
    }
    if (selectionBox) {
      selectionBox.remove();
      selectionBox = null;
    }
    if (selectionInfo) {
      selectionInfo.remove();
      selectionInfo = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    isSelecting = false;
  }

  /**
   * 鼠标按下事件处理
   */
  function onMouseDown(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
    selectionInfo.style.display = 'block';
    
    e.preventDefault();
  }

  /**
   * 鼠标移动事件处理
   */
  function onMouseMove(e) {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';

    // 更新尺寸信息显示
    selectionInfo.textContent = `${width} × ${height}`;
    selectionInfo.style.left = (left + width + 10) + 'px';
    selectionInfo.style.top = top + 'px';

    // 如果超出右边界，显示在左侧
    if (left + width + 100 > window.innerWidth) {
      selectionInfo.style.left = (left - 80) + 'px';
    }
  }

  /**
   * 鼠标释放事件处理
   */
  function onMouseUp() {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = getSelectionRect();
    
    // 如果选区太小，忽略
    if (rect.width < 10 || rect.height < 10) {
      removeSelectionOverlay();
      return;
    }

    // 发送选区信息到 background，包含设备像素比
    chrome.runtime.sendMessage({
      action: 'selectionComplete',
      rect: rect,
      devicePixelRatio: window.devicePixelRatio || 1
    });

    removeSelectionOverlay();
  }

  /**
   * 键盘事件处理 - Escape 取消
   */
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeSelectionOverlay();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }

  /**
   * 获取当前选区矩形
   * @returns {SelectionRect}
   */
  function getSelectionRect() {
    if (!selectionBox) return null;
    
    const rect = selectionBox.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }


  // ============================================
  // 3.3 进度指示器
  // ============================================

  let progressContainer = null;

  /**
   * 显示进度指示器
   * @param {number} percent - 进度百分比 (0-100)
   */
  function showProgressIndicator(percent) {
    if (!progressContainer) {
      progressContainer = document.createElement('div');
      progressContainer.id = 'scroll-capture-progress';
      progressContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;

      progressContainer.innerHTML = `
        <div style="width: 150px; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
          <div id="scroll-capture-progress-bar" style="width: 0%; height: 100%; background: #4a90d9; transition: width 0.2s;"></div>
        </div>
        <span id="scroll-capture-progress-text">0%</span>
      `;

      document.body.appendChild(progressContainer);
    }

    const progressBar = document.getElementById('scroll-capture-progress-bar');
    const progressText = document.getElementById('scroll-capture-progress-text');
    
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressText) progressText.textContent = Math.round(percent) + '%';
  }

  /**
   * 隐藏进度指示器
   */
  function hideProgressIndicator() {
    if (progressContainer) {
      progressContainer.remove();
      progressContainer = null;
    }
  }

  // ============================================
  // 消息监听
  // ============================================

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case 'getScrollInfo':
        sendResponse(getScrollInfo());
        break;

      case 'scrollTo':
        scrollToPosition(message.y).then(() => {
          sendResponse({ success: true });
        });
        return true; // 异步响应

      case 'startSelection':
        createSelectionOverlay();
        sendResponse({ success: true });
        break;

      case 'cancelSelection':
        removeSelectionOverlay();
        sendResponse({ success: true });
        break;

      case 'showProgress':
        showProgressIndicator(message.percent);
        sendResponse({ success: true });
        break;

      case 'updateProgress':
        showProgressIndicator(message.percent);
        sendResponse({ success: true });
        break;

      case 'hideProgress':
        hideProgressIndicator();
        sendResponse({ success: true });
        break;

      case 'showPreview':
        showPreviewPanel(message.dataUrl, message.dimensions);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  });

  // ============================================
  // 3.4 截图预览浮层
  // ============================================

  let previewPanel = null;
  let currentDataUrl = null;

  /**
   * 显示截图预览浮层
   */
  function showPreviewPanel(dataUrl, dimensions) {
    removePreviewPanel();
    currentDataUrl = dataUrl;

    previewPanel = document.createElement('div');
    previewPanel.id = 'scroll-capture-preview';
    previewPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const dimText = dimensions ? `${dimensions.width} × ${dimensions.height}` : '';
    
    previewPanel.innerHTML = `
      <div style="padding: 12px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px; color: #666;">${dimText}</span>
        <button id="scroll-capture-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 0 4px;">×</button>
      </div>
      <div style="padding: 16px; overflow: auto; max-height: calc(90vh - 120px);">
        <img src="${dataUrl}" style="max-width: 100%; display: block; border-radius: 4px;" />
      </div>
      <div style="padding: 12px 16px; border-top: 1px solid #eee; display: flex; gap: 8px; justify-content: flex-end;">
        <button id="scroll-capture-copy" style="padding: 8px 16px; background: #4a90d9; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">复制</button>
        <button id="scroll-capture-save" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">保存</button>
      </div>
    `;

    // 添加背景遮罩
    const backdrop = document.createElement('div');
    backdrop.id = 'scroll-capture-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483646;
    `;
    backdrop.addEventListener('click', removePreviewPanel);

    document.body.appendChild(backdrop);
    document.body.appendChild(previewPanel);

    // 绑定按钮事件
    document.getElementById('scroll-capture-close').addEventListener('click', removePreviewPanel);
    document.getElementById('scroll-capture-copy').addEventListener('click', copyToClipboard);
    document.getElementById('scroll-capture-save').addEventListener('click', saveImage);
    document.addEventListener('keydown', onPreviewKeyDown);
  }

  /**
   * 移除预览浮层
   */
  function removePreviewPanel() {
    const backdrop = document.getElementById('scroll-capture-backdrop');
    if (backdrop) backdrop.remove();
    if (previewPanel) {
      previewPanel.remove();
      previewPanel = null;
    }
    currentDataUrl = null;
    document.removeEventListener('keydown', onPreviewKeyDown);
  }

  /**
   * 预览面板键盘事件
   */
  function onPreviewKeyDown(e) {
    if (e.key === 'Escape') {
      removePreviewPanel();
    }
  }

  /**
   * 复制到剪贴板
   */
  async function copyToClipboard() {
    if (!currentDataUrl) return;
    try {
      const response = await fetch(currentDataUrl);
      const blob = await response.blob();
      
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const img = document.createElement('img');
        img.src = currentDataUrl;
        await new Promise(resolve => { img.onload = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }
      
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      showToast('已复制到剪贴板');
    } catch (err) {
      showToast('复制失败: ' + err.message);
    }
  }

  /**
   * 保存图片
   */
  async function saveImage() {
    if (!currentDataUrl) return;
    try {
      await chrome.runtime.sendMessage({
        action: 'download',
        dataUrl: currentDataUrl,
        format: 'png'
      });
      showToast('已保存');
    } catch (err) {
      showToast('保存失败: ' + err.message);
    }
  }

  /**
   * 显示提示消息
   */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

})();
