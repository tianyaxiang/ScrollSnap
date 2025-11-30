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
  // 记录开始时的视口坐标
  let startViewportX = 0;
  let startViewportY = 0;
  // 存储检测到的可滚动容器
  let scrollableContainer = null;

  // 选区容器（用于隔离样式）
  let selectionContainer = null;
  
  // 标记当前选区是否在滚动容器内
  let isSelectingInContainer = false;
  // 缓存选区开始时的容器引用
  let activeContainer = null;

  /**
   * 创建选区覆盖层 UI（支持滚动）
   */
  function createSelectionOverlay() {
    // 移除已存在的覆盖层
    removeSelectionOverlay();

    // 创建一个隔离容器，防止页面样式干扰
    selectionContainer = document.createElement('div');
    selectionContainer.id = 'scroll-capture-container';
    // 使用 all: initial 重置所有继承的样式
    selectionContainer.style.cssText = `
      all: initial;
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483646;
      pointer-events: none;
    `;

    // 创建覆盖层容器（fixed定位，不阻止滚动）
    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'scroll-capture-overlay';
    selectionOverlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.3) !important;
      cursor: crosshair !important;
      z-index: 2147483646 !important;
      pointer-events: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-sizing: border-box !important;
    `;

    // 创建选区框（使用fixed定位，通过计算视口坐标来显示）
    selectionBox = document.createElement('div');
    selectionBox.id = 'scroll-capture-selection';
    selectionBox.style.cssText = `
      position: fixed !important;
      border: 2px dashed #4a90d9 !important;
      background: rgba(74, 144, 217, 0.1) !important;
      display: none !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    `;

    // 创建尺寸信息显示（fixed定位，始终可见）
    selectionInfo = document.createElement('div');
    selectionInfo.id = 'scroll-capture-info';
    selectionInfo.style.cssText = `
      position: fixed !important;
      background: #4a90d9 !important;
      color: white !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-family: Arial, sans-serif !important;
      display: none !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      line-height: 1.4 !important;
    `;

    // 创建操作提示
    selectionHint = document.createElement('div');
    selectionHint.id = 'scroll-capture-hint';
    selectionHint.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(0, 0, 0, 0.8) !important;
      color: white !important;
      padding: 10px 20px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-family: Arial, sans-serif !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      white-space: nowrap !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      line-height: 1.4 !important;
    `;
    selectionHint.textContent = chrome.i18n.getMessage('selectionHint') || 'Drag to select area, scroll to extend | ESC to cancel';

    // 将所有元素添加到隔离容器中
    selectionContainer.appendChild(selectionOverlay);
    selectionContainer.appendChild(selectionBox);
    selectionContainer.appendChild(selectionInfo);
    selectionContainer.appendChild(selectionHint);
    
    // 将容器添加到 body 末尾
    document.body.appendChild(selectionContainer);

    // 绑定事件
    selectionOverlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    // 允许滚轮滚动
    selectionOverlay.addEventListener('wheel', onWheel, { passive: false });

    // 强制重绘，确保样式生效
    void selectionContainer.offsetHeight;

    return selectionOverlay;
  }

  /**
   * 移除选区覆盖层
   */
  function removeSelectionOverlay() {
    // 移除事件监听
    if (selectionOverlay) {
      selectionOverlay.removeEventListener('mousedown', onMouseDown);
      selectionOverlay.removeEventListener('wheel', onWheel);
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', onScroll, true);
    
    // 移除整个容器（包含所有子元素）
    if (selectionContainer) {
      selectionContainer.remove();
      selectionContainer = null;
    }
    
    // 重置引用
    selectionOverlay = null;
    selectionBox = null;
    selectionInfo = null;
    selectionHint = null;
    
    // 重置状态
    isSelecting = false;
    hasStartedSelection = false;
    scrollableContainer = null;
    isSelectingInContainer = false;
    activeContainer = null;
  }

  /**
   * 检测页面中的主要可滚动容器
   * 某些 SPA 网站（如 claude.ai）使用内部滚动容器而非 window 滚动
   */
  function detectScrollableContainer() {
    // 如果已经检测过，直接返回
    if (scrollableContainer !== null) {
      return scrollableContainer || null;
    }

    // 常见的可滚动容器选择器
    const commonSelectors = [
      '[data-is-streaming]', // Claude.ai 对话容器
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

    // 首先尝试常见选择器
    for (const selector of commonSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (isScrollable(el)) {
            scrollableContainer = el;
            console.log('[ScrollCapture] Found scrollable container via selector:', selector);
            return el;
          }
        }
      } catch (e) {
        // 选择器可能无效，忽略
      }
    }

    // 如果没找到，遍历查找最大的可滚动容器
    const allElements = document.querySelectorAll('div, main, section, article');
    let bestContainer = null;
    let bestScore = 0;

    for (const el of allElements) {
      if (isScrollable(el)) {
        // 计算得分：可滚动高度 * 可见面积占比
        const rect = el.getBoundingClientRect();
        const visibleArea = rect.width * rect.height;
        const viewportArea = window.innerWidth * window.innerHeight;
        const areaRatio = visibleArea / viewportArea;
        const scrollableHeight = el.scrollHeight - el.clientHeight;
        
        // 只考虑占据视口较大面积的容器
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
      scrollableContainer = bestContainer;
      console.log('[ScrollCapture] Found scrollable container via scan:', bestContainer);
      return bestContainer;
    }

    // 没有找到特殊容器，使用 window 滚动
    scrollableContainer = false; // 标记为已检测但未找到
    return null;
  }

  /**
   * 检查元素是否可滚动
   */
  function isScrollable(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const isScrollableStyle = overflowY === 'auto' || overflowY === 'scroll';
    const hasScrollableContent = el.scrollHeight > el.clientHeight + 10;
    return isScrollableStyle && hasScrollableContent;
  }

  /**
   * 获取当前滚动位置
   */
  function getCurrentScroll() {
    if (isSelectingInContainer && activeContainer) {
      return { x: activeContainer.scrollLeft, y: activeContainer.scrollTop };
    }
    return { x: window.scrollX, y: window.scrollY };
  }

  /**
   * 检查点击位置是否在容器内，并设置选区模式
   */
  function checkAndSetContainerMode(clientX, clientY) {
    const container = detectScrollableContainer();
    if (container) {
      const containerRect = container.getBoundingClientRect();
      if (clientX >= containerRect.left && clientX <= containerRect.right &&
          clientY >= containerRect.top && clientY <= containerRect.bottom) {
        isSelectingInContainer = true;
        activeContainer = container;
        return true;
      }
    }
    isSelectingInContainer = false;
    activeContainer = null;
    return false;
  }

  /**
   * 将视口坐标转换为文档坐标
   * 根据选区模式决定使用容器坐标还是页面坐标
   */
  function clientToDocCoords(clientX, clientY) {
    if (isSelectingInContainer && activeContainer) {
      const containerRect = activeContainer.getBoundingClientRect();
      // 返回相对于容器内容的坐标
      return {
        x: clientX - containerRect.left + activeContainer.scrollLeft,
        y: clientY - containerRect.top + activeContainer.scrollTop
      };
    }
    // 使用页面文档坐标
    return {
      x: clientX + window.scrollX,
      y: clientY + window.scrollY
    };
  }

  /**
   * 将文档坐标转换为视口坐标
   */
  function docToClientCoords(docX, docY) {
    if (isSelectingInContainer && activeContainer) {
      const containerRect = activeContainer.getBoundingClientRect();
      // 返回相对于视口的坐标
      return {
        x: containerRect.left + (docX - activeContainer.scrollLeft),
        y: containerRect.top + (docY - activeContainer.scrollTop)
      };
    }
    return {
      x: docX - window.scrollX,
      y: docY - window.scrollY
    };
  }

  /**
   * 滚动到指定位置（支持内部容器）
   */
  function scrollTo(x, y) {
    if (isSelectingInContainer && activeContainer) {
      activeContainer.scrollTo({ top: y, left: x, behavior: 'instant' });
    } else {
      window.scrollTo({ top: y, left: x, behavior: 'instant' });
    }
  }

  /**
   * 滚动指定距离（支持内部容器）
   */
  function scrollBy(deltaX, deltaY) {
    if (isSelectingInContainer && activeContainer) {
      activeContainer.scrollBy({ top: deltaY, left: deltaX, behavior: 'instant' });
    } else {
      window.scrollBy({ top: deltaY, left: deltaX, behavior: 'instant' });
    }
  }

  /**
   * 滚轮事件处理 - 允许滚动页面
   */
  function onWheel(e) {
    // 阻止默认行为但手动滚动页面/容器
    e.preventDefault();
    scrollBy(e.deltaX, e.deltaY);
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
    
    // 重置滚动容器检测，确保每次选区都重新检测
    scrollableContainer = null;
    isSelectingInContainer = false;
    activeContainer = null;
    
    // 先检测容器并设置选区模式（必须在 clientToDocCoords 之前调用）
    checkAndSetContainerMode(e.clientX, e.clientY);
    
    // 计算文档坐标（会根据 isSelectingInContainer 决定使用哪种坐标系）
    const docCoords = clientToDocCoords(e.clientX, e.clientY);
    startDocX = docCoords.x;
    startDocY = docCoords.y;
    
    // 同时记录视口坐标，用于后续计算
    startViewportX = e.clientX;
    startViewportY = e.clientY;
    
    currentDocX = startDocX;
    currentDocY = startDocY;

    console.log('[ScrollCapture] onMouseDown:', {
      clientX: e.clientX, clientY: e.clientY,
      docX: startDocX, docY: startDocY,
      isSelectingInContainer,
      container: activeContainer ? 'found' : 'none'
    });
    
    // 显示选区框和信息（使用 !important 确保样式生效）
    if (selectionBox) {
      selectionBox.style.cssText = selectionBox.style.cssText.replace('display: none', 'display: block');
    }
    if (selectionInfo) {
      selectionInfo.style.cssText = selectionInfo.style.cssText.replace('display: none', 'display: block');
    }
    
    // 隐藏提示
    if (selectionHint) {
      selectionHint.style.cssText = selectionHint.style.cssText.replace(/display:\s*[^;!]+/, 'display: none');
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
    const docCoords = clientToDocCoords(e.clientX, e.clientY);
    currentDocX = docCoords.x;
    currentDocY = docCoords.y;

    updateSelectionBox();
    
    // 边缘自动滚动
    autoScrollAtEdge(e.clientX, e.clientY);
  }

  /**
   * 更新选区框显示
   */
  function updateSelectionBox() {
    if (!selectionBox || !selectionInfo) return;
    
    // 选区的文档坐标
    const left = Math.min(startDocX, currentDocX);
    const top = Math.min(startDocY, currentDocY);
    const width = Math.abs(currentDocX - startDocX);
    const height = Math.abs(currentDocY - startDocY);

    // 将文档坐标转换为视口坐标（用于 fixed 定位的选区框）
    const viewCoords = docToClientCoords(left, top);
    const viewLeft = viewCoords.x;
    const viewTop = viewCoords.y;
    
    // 选区框使用视口坐标（fixed定位）
    // 需要处理选区可能部分在视口外的情况
    const visibleLeft = Math.max(0, viewLeft);
    const visibleTop = Math.max(0, viewTop);
    const visibleRight = Math.min(window.innerWidth, viewLeft + width);
    const visibleBottom = Math.min(window.innerHeight, viewTop + height);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    
    // 如果选区完全在视口外，隐藏选区框
    if (visibleWidth <= 0 || visibleHeight <= 0) {
      selectionBox.style.setProperty('display', 'none', 'important');
    } else {
      selectionBox.style.setProperty('display', 'block', 'important');
      selectionBox.style.setProperty('left', viewLeft + 'px', 'important');
      selectionBox.style.setProperty('top', viewTop + 'px', 'important');
      selectionBox.style.setProperty('width', width + 'px', 'important');
      selectionBox.style.setProperty('height', height + 'px', 'important');
    }

    // 更新尺寸信息（显示完整选区尺寸，不是可见部分）
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
    
    selectionInfo.style.setProperty('left', infoLeft + 'px', 'important');
    selectionInfo.style.setProperty('top', infoTop + 'px', 'important');
  }

  /**
   * 边缘自动滚动
   */
  let autoScrollInterval = null;
  function autoScrollAtEdge(clientX, clientY) {
    const edgeThreshold = 50;
    const scrollSpeed = 15;
    
    let scrollDeltaX = 0;
    let scrollDeltaY = 0;
    
    if (clientY < edgeThreshold) {
      scrollDeltaY = -scrollSpeed;
    } else if (clientY > window.innerHeight - edgeThreshold) {
      scrollDeltaY = scrollSpeed;
    }
    
    if (clientX < edgeThreshold) {
      scrollDeltaX = -scrollSpeed;
    } else if (clientX > window.innerWidth - edgeThreshold) {
      scrollDeltaX = scrollSpeed;
    }
    
    if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
      if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
          scrollBy(scrollDeltaX, scrollDeltaY);
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

    // 获取滚动容器信息（使用选区开始时确定的容器）
    const container = isSelectingInContainer ? activeContainer : null;
    const currentScroll = getCurrentScroll();
    let containerInfo = null;
    
    if (container) {
      const containerRect = container.getBoundingClientRect();
      containerInfo = {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        scrollHeight: container.scrollHeight,
        scrollWidth: container.scrollWidth,
        clientHeight: container.clientHeight,
        clientWidth: container.clientWidth,
        // 容器在视口中的位置
        viewportTop: containerRect.top,
        viewportLeft: containerRect.left,
        viewportWidth: containerRect.width,
        viewportHeight: containerRect.height
      };
    }

    console.log('[ScrollCapture] onMouseUp:', {
      rect,
      currentScroll,
      isSelectingInContainer,
      containerInfo: containerInfo ? {
        viewportTop: containerInfo.viewportTop,
        viewportLeft: containerInfo.viewportLeft,
        scrollTop: containerInfo.scrollTop,
        scrollLeft: containerInfo.scrollLeft
      } : null
    });

    // 发送选区信息到 background
    // rect 使用的是文档坐标（相对于滚动内容的坐标）
    // 同时传递当前滚动位置，以便 background 正确计算
    chrome.runtime.sendMessage({
      action: 'scrollSelectionComplete',
      rect: rect,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollHeight: container ? container.scrollHeight : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      devicePixelRatio: window.devicePixelRatio || 1,
      containerInfo: containerInfo,
      currentScroll: currentScroll
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
