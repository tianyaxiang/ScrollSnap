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
  // 3.2 选区截图交互（支持滚动）
  // ============================================

  let selectionOverlay = null;
  let selectionBox = null;
  let selectionInfo = null;
  let selectionHint = null;
  let isSelecting = false;
  let hasStartedSelection = false;
  // 使用文档坐标（绝对坐标）来记录选区
  let startDocX = 0;
  let startDocY = 0;
  let currentDocX = 0;
  let currentDocY = 0;

  /**
   * 创建选区覆盖层 UI（支持滚动）
   */
  function createSelectionOverlay() {
    // 移除已存在的覆盖层
    removeSelectionOverlay();

    // 创建覆盖层容器（fixed定位，不阻止滚动）
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

    // 创建选区框（使用absolute定位，跟随文档滚动）
    selectionBox = document.createElement('div');
    selectionBox.id = 'scroll-capture-selection';
    selectionBox.style.cssText = `
      position: absolute;
      border: 2px dashed #4a90d9;
      background: rgba(74, 144, 217, 0.1);
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `;

    // 创建尺寸信息显示（fixed定位，始终可见）
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

    // 创建操作提示
    selectionHint = document.createElement('div');
    selectionHint.id = 'scroll-capture-hint';
    selectionHint.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-family: Arial, sans-serif;
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
    `;
    selectionHint.textContent = chrome.i18n.getMessage('selectionHint') || 'Drag to select area, scroll to extend | ESC to cancel';

    document.body.appendChild(selectionOverlay);
    document.body.appendChild(selectionBox);
    document.body.appendChild(selectionInfo);
    document.body.appendChild(selectionHint);

    // 绑定事件
    selectionOverlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    // 允许滚轮滚动
    selectionOverlay.addEventListener('wheel', onWheel, { passive: false });

    return selectionOverlay;
  }

  /**
   * 移除选区覆盖层
   */
  function removeSelectionOverlay() {
    if (selectionOverlay) {
      selectionOverlay.removeEventListener('mousedown', onMouseDown);
      selectionOverlay.removeEventListener('wheel', onWheel);
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
    if (selectionHint) {
      selectionHint.remove();
      selectionHint = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', onScroll, true);
    isSelecting = false;
    hasStartedSelection = false;
  }

  /**
   * 滚轮事件处理 - 允许滚动页面
   */
  function onWheel(e) {
    // 阻止默认行为但手动滚动页面
    e.preventDefault();
    window.scrollBy({
      top: e.deltaY,
      left: e.deltaX,
      behavior: 'instant'
    });
  }

  /**
   * 滚动事件处理 - 更新选区显示
   */
  function onScroll() {
    if (hasStartedSelection) {
      updateSelectionBox();
    }
  }

  /**
   * 鼠标按下事件处理
   */
  function onMouseDown(e) {
    isSelecting = true;
    hasStartedSelection = true;
    
    // 记录文档坐标（视口坐标 + 滚动偏移）
    startDocX = e.clientX + window.scrollX;
    startDocY = e.clientY + window.scrollY;
    currentDocX = startDocX;
    currentDocY = startDocY;
    
    selectionBox.style.display = 'block';
    selectionInfo.style.display = 'block';
    
    // 隐藏提示
    if (selectionHint) {
      selectionHint.style.display = 'none';
    }
    
    updateSelectionBox();
    e.preventDefault();
  }

  /**
   * 鼠标移动事件处理
   */
  function onMouseMove(e) {
    if (!isSelecting) return;

    // 更新当前文档坐标
    currentDocX = e.clientX + window.scrollX;
    currentDocY = e.clientY + window.scrollY;

    updateSelectionBox();
    
    // 边缘自动滚动
    autoScrollAtEdge(e.clientX, e.clientY);
  }

  /**
   * 更新选区框显示
   */
  function updateSelectionBox() {
    const left = Math.min(startDocX, currentDocX);
    const top = Math.min(startDocY, currentDocY);
    const width = Math.abs(currentDocX - startDocX);
    const height = Math.abs(currentDocY - startDocY);

    // 选区框使用文档坐标（absolute定位）
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';

    // 尺寸信息使用视口坐标（fixed定位）
    const viewLeft = left - window.scrollX;
    const viewTop = top - window.scrollY;
    
    selectionInfo.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    
    // 计算信息框位置，确保在视口内
    let infoLeft = viewLeft + width + 10;
    let infoTop = viewTop;
    
    // 如果超出右边界，显示在左侧
    if (infoLeft + 80 > window.innerWidth) {
      infoLeft = viewLeft - 80;
    }
    // 如果超出左边界
    if (infoLeft < 10) {
      infoLeft = 10;
    }
    // 如果超出上边界
    if (infoTop < 10) {
      infoTop = 10;
    }
    // 如果超出下边界
    if (infoTop > window.innerHeight - 30) {
      infoTop = window.innerHeight - 30;
    }
    
    selectionInfo.style.left = infoLeft + 'px';
    selectionInfo.style.top = infoTop + 'px';
  }

  /**
   * 边缘自动滚动
   */
  let autoScrollInterval = null;
  function autoScrollAtEdge(clientX, clientY) {
    const edgeThreshold = 50;
    const scrollSpeed = 15;
    
    let scrollX = 0;
    let scrollY = 0;
    
    if (clientY < edgeThreshold) {
      scrollY = -scrollSpeed;
    } else if (clientY > window.innerHeight - edgeThreshold) {
      scrollY = scrollSpeed;
    }
    
    if (clientX < edgeThreshold) {
      scrollX = -scrollSpeed;
    } else if (clientX > window.innerWidth - edgeThreshold) {
      scrollX = scrollSpeed;
    }
    
    if (scrollX !== 0 || scrollY !== 0) {
      if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
          window.scrollBy(scrollX, scrollY);
        }, 16);
      }
    } else {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
    }
  }

  /**
   * 鼠标释放事件处理
   */
  function onMouseUp() {
    if (!isSelecting) return;
    isSelecting = false;
    
    // 停止自动滚动
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }

    const rect = getSelectionRect();
    
    // 如果选区太小，忽略
    if (rect.width < 10 || rect.height < 10) {
      removeSelectionOverlay();
      return;
    }

    // 发送选区信息到 background，使用文档坐标
    chrome.runtime.sendMessage({
      action: 'scrollSelectionComplete',
      rect: rect,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      devicePixelRatio: window.devicePixelRatio || 1
    });

    removeSelectionOverlay();
  }

  /**
   * 键盘事件处理 - Escape 取消
   */
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      // 停止自动滚动
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
      removeSelectionOverlay();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }

  /**
   * 获取当前选区矩形（文档坐标）
   */
  function getSelectionRect() {
    const left = Math.min(startDocX, currentDocX);
    const top = Math.min(startDocY, currentDocY);
    const width = Math.abs(currentDocX - startDocX);
    const height = Math.abs(currentDocY - startDocY);
    
    return {
      x: left,
      y: top,
      width: width,
      height: height
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
