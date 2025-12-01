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
  let selectionToolbar = null;
  let selectionHandles = [];
  let isSelecting = false;
  let hasStartedSelection = false;
  let isSelectionComplete = false; // 选区绘制完成，进入调整模式
  let isDraggingSelection = false; // 是否正在拖拽移动选区
  let isResizingSelection = false; // 是否正在调整选区大小
  let resizeHandle = null; // 当前拖拽的控制点
  let dragStartX = 0;
  let dragStartY = 0;
  // 使用文档坐标（绝对坐标）来记录选区
  let startDocX = 0;
  let startDocY = 0;
  let currentDocX = 0;
  let currentDocY = 0;
  // 选区的固定坐标（用于调整模式）
  let selectionLeft = 0;
  let selectionTop = 0;
  let selectionWidth = 0;
  let selectionHeight = 0;
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
      background: rgba(0, 0, 0, 0.5) !important;
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
      border: 2px solid #07C160 !important;
      background: transparent !important;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5) !important;
      display: none !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      border-radius: 0 !important;
    `;

    // 创建尺寸信息显示（显示在选区左上角内部）
    selectionInfo = document.createElement('div');
    selectionInfo.id = 'scroll-capture-info';
    selectionInfo.style.cssText = `
      position: fixed !important;
      background: rgba(0, 0, 0, 0.75) !important;
      color: white !important;
      padding: 2px 6px !important;
      border-radius: 2px !important;
      font-size: 11px !important;
      font-weight: 400 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
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
      background: rgba(0, 0, 0, 0.75) !important;
      color: white !important;
      padding: 8px 16px !important;
      border-radius: 4px !important;
      font-size: 13px !important;
      font-weight: 400 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      white-space: nowrap !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      line-height: 1.4 !important;
      animation: fadeIn 0.2s ease !important;
    `;
    selectionHint.textContent = chrome.i18n.getMessage('selectionHint') || '拖动选择区域，滚动可扩展选区 | ESC 取消';

    // 创建工具栏（选区完成后显示）
    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'scroll-capture-toolbar';
    selectionToolbar.style.cssText = `
      position: fixed !important;
      display: none !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 4px !important;
      background: #fff !important;
      border-radius: 4px !important;
      padding: 4px !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
      z-index: 2147483648 !important;
      pointer-events: auto !important;
      margin: 0 !important;
      box-sizing: border-box !important;
    `;

    // 工具栏按钮样式
    const buttonStyle = `
      width: 32px !important;
      height: 32px !important;
      border: none !important;
      border-radius: 4px !important;
      background: transparent !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      margin: 0 !important;
      transition: background 0.15s !important;
    `;

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'scroll-capture-cancel';
    cancelBtn.style.cssText = buttonStyle;
    cancelBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    cancelBtn.title = '取消 (ESC)';
    cancelBtn.onmouseenter = () => cancelBtn.style.background = '#f5f5f5';
    cancelBtn.onmouseleave = () => cancelBtn.style.background = 'transparent';
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      removeSelectionOverlay();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    };

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'scroll-capture-confirm';
    confirmBtn.style.cssText = buttonStyle + `background: #07C160 !important; border-radius: 4px !important;`;
    confirmBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`;
    confirmBtn.title = '确认截图 (Enter)';
    confirmBtn.onmouseenter = () => confirmBtn.style.background = '#06ae56';
    confirmBtn.onmouseleave = () => confirmBtn.style.background = '#07C160';
    confirmBtn.onclick = (e) => {
      e.stopPropagation();
      confirmSelection();
    };

    selectionToolbar.appendChild(cancelBtn);
    selectionToolbar.appendChild(confirmBtn);

    // 创建 8 个控制点
    const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const cursors = {
      'nw': 'nwse-resize', 'n': 'ns-resize', 'ne': 'nesw-resize', 'e': 'ew-resize',
      'se': 'nwse-resize', 's': 'ns-resize', 'sw': 'nesw-resize', 'w': 'ew-resize'
    };

    selectionHandles = handlePositions.map(pos => {
      const handle = document.createElement('div');
      handle.className = 'scroll-capture-handle';
      handle.dataset.position = pos;
      handle.style.cssText = `
        position: fixed !important;
        width: 8px !important;
        height: 8px !important;
        background: #07C160 !important;
        border: 1px solid #fff !important;
        border-radius: 1px !important;
        display: none !important;
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        cursor: ${cursors[pos]} !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      `;
      handle.onmousedown = (e) => onHandleMouseDown(e, pos);
      return handle;
    });

    // 添加动画样式
    const styleEl = document.createElement('style');
    styleEl.id = 'scroll-capture-styles';
    styleEl.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    selectionContainer.appendChild(styleEl);

    // 将所有元素添加到隔离容器中
    selectionContainer.appendChild(selectionOverlay);
    selectionContainer.appendChild(selectionBox);
    selectionContainer.appendChild(selectionInfo);
    selectionContainer.appendChild(selectionHint);
    selectionContainer.appendChild(selectionToolbar);
    selectionHandles.forEach(handle => selectionContainer.appendChild(handle));

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
    if (selectionBox) {
      selectionBox.removeEventListener('mousedown', onSelectionBoxMouseDown);
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
    selectionToolbar = null;
    selectionHandles = [];

    // 重置状态
    isSelecting = false;
    hasStartedSelection = false;
    isSelectionComplete = false;
    isDraggingSelection = false;
    isResizingSelection = false;
    resizeHandle = null;
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
    // 如果已经在调整模式，点击选区外部区域重新开始绘制
    if (isSelectionComplete) {
      // 检查是否点击在选区外
      const clickX = e.clientX;
      const clickY = e.clientY;
      const inSelection = (
        clickX >= selectionLeft &&
        clickX <= selectionLeft + selectionWidth &&
        clickY >= selectionTop &&
        clickY <= selectionTop + selectionHeight
      );

      if (!inSelection) {
        // 重置调整模式状态
        isSelectionComplete = false;
        isDraggingSelection = false;
        isResizingSelection = false;
        resizeHandle = null;

        // 隐藏控制点和工具栏
        selectionHandles.forEach(handle => {
          handle.style.setProperty('display', 'none', 'important');
        });
        if (selectionToolbar) {
          selectionToolbar.style.setProperty('display', 'none', 'important');
        }

        // 重置选区框样式
        selectionBox.style.setProperty('pointer-events', 'none', 'important');
        selectionBox.style.setProperty('cursor', 'crosshair', 'important');
        selectionBox.removeEventListener('mousedown', onSelectionBoxMouseDown);

        // 显示提示
        if (selectionHint) {
          selectionHint.style.setProperty('display', 'block', 'important');
        }
      } else {
        // 点击在选区内，不做处理（由选区框的 mousedown 事件处理）
        return;
      }
    }

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

    // 显示选区框和信息
    if (selectionBox) {
      selectionBox.style.setProperty('display', 'block', 'important');
    }
    if (selectionInfo) {
      selectionInfo.style.setProperty('display', 'block', 'important');
    }

    // 隐藏提示
    if (selectionHint) {
      selectionHint.style.setProperty('display', 'none', 'important');
    }

    updateSelectionBox();
    e.preventDefault();
  }

  /**
   * 鼠标移动事件处理
   */
  function onMouseMove(e) {
    // 正在绘制选区
    if (isSelecting && !isSelectionComplete) {
      const docCoords = clientToDocCoords(e.clientX, e.clientY);
      currentDocX = docCoords.x;
      currentDocY = docCoords.y;
      updateSelectionBox();
      autoScrollAtEdge(e.clientX, e.clientY);
      return;
    }

    // 正在拖拽移动选区
    if (isDraggingSelection) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      selectionLeft += dx;
      selectionTop += dy;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      updateSelectionUI();
      return;
    }

    // 正在调整选区大小
    if (isResizingSelection && resizeHandle) {
      handleResize(e.clientX, e.clientY);
      return;
    }
  }

  /**
   * 更新选区框显示（绘制模式）
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

    // 如果选区完全在视口外，隐藏选区框
    if (width <= 0 || height <= 0) {
      selectionBox.style.setProperty('display', 'none', 'important');
    } else {
      selectionBox.style.setProperty('display', 'block', 'important');
      selectionBox.style.setProperty('left', viewLeft + 'px', 'important');
      selectionBox.style.setProperty('top', viewTop + 'px', 'important');
      selectionBox.style.setProperty('width', width + 'px', 'important');
      selectionBox.style.setProperty('height', height + 'px', 'important');
    }

    // 更新尺寸信息（显示在选区左上角上方）
    selectionInfo.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    let infoTop = viewTop - 22;
    if (infoTop < 5) infoTop = viewTop + 5;
    selectionInfo.style.setProperty('left', viewLeft + 'px', 'important');
    selectionInfo.style.setProperty('top', infoTop + 'px', 'important');
  }

  /**
   * 更新选区 UI（调整模式 - 使用视口坐标）
   */
  function updateSelectionUI() {
    if (!selectionBox || !selectionInfo) return;

    const viewLeft = selectionLeft;
    const viewTop = selectionTop;
    const width = selectionWidth;
    const height = selectionHeight;

    // 更新选区框
    selectionBox.style.setProperty('display', 'block', 'important');
    selectionBox.style.setProperty('left', viewLeft + 'px', 'important');
    selectionBox.style.setProperty('top', viewTop + 'px', 'important');
    selectionBox.style.setProperty('width', width + 'px', 'important');
    selectionBox.style.setProperty('height', height + 'px', 'important');

    // 更新尺寸信息
    selectionInfo.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    let infoTop = viewTop - 22;
    if (infoTop < 5) infoTop = viewTop + 5;
    selectionInfo.style.setProperty('left', viewLeft + 'px', 'important');
    selectionInfo.style.setProperty('top', infoTop + 'px', 'important');

    // 更新控制点位置
    updateHandles(viewLeft, viewTop, width, height);

    // 更新工具栏位置
    updateToolbar(viewLeft, viewTop, width, height);
  }

  /**
   * 更新控制点位置
   */
  function updateHandles(left, top, width, height) {
    const positions = {
      'nw': { x: left - 4, y: top - 4 },
      'n': { x: left + width / 2 - 4, y: top - 4 },
      'ne': { x: left + width - 4, y: top - 4 },
      'e': { x: left + width - 4, y: top + height / 2 - 4 },
      'se': { x: left + width - 4, y: top + height - 4 },
      's': { x: left + width / 2 - 4, y: top + height - 4 },
      'sw': { x: left - 4, y: top + height - 4 },
      'w': { x: left - 4, y: top + height / 2 - 4 }
    };

    selectionHandles.forEach(handle => {
      const pos = handle.dataset.position;
      const coords = positions[pos];
      handle.style.setProperty('display', 'block', 'important');
      handle.style.setProperty('left', coords.x + 'px', 'important');
      handle.style.setProperty('top', coords.y + 'px', 'important');
    });
  }

  /**
   * 更新工具栏位置
   */
  function updateToolbar(left, top, width, height) {
    if (!selectionToolbar) return;

    const toolbarWidth = 76;
    const toolbarHeight = 40;
    const gap = 8;

    // 默认显示在选区右下角下方
    let toolbarLeft = left + width - toolbarWidth;
    let toolbarTop = top + height + gap;

    // 如果底部空间不足，尝试显示在选区内部底部
    if (toolbarTop + toolbarHeight > window.innerHeight - 5) {
      // 选区内部底部
      toolbarTop = top + height - toolbarHeight - gap;

      // 如果选区太小，工具栏会超出选区顶部，则显示在选区上方
      if (toolbarTop < top + gap) {
        toolbarTop = top - toolbarHeight - gap;

        // 如果上方也没空间，强制显示在选区内部
        if (toolbarTop < 5) {
          toolbarTop = top + gap;
        }
      }
    }

    // 如果超出右边界
    if (toolbarLeft + toolbarWidth > window.innerWidth - 5) {
      toolbarLeft = window.innerWidth - toolbarWidth - 5;
    }
    // 如果超出左边界
    if (toolbarLeft < 5) {
      toolbarLeft = 5;
    }

    selectionToolbar.style.setProperty('display', 'flex', 'important');
    selectionToolbar.style.setProperty('left', toolbarLeft + 'px', 'important');
    selectionToolbar.style.setProperty('top', toolbarTop + 'px', 'important');
  }

  /**
   * 控制点鼠标按下事件
   */
  function onHandleMouseDown(e, position) {
    e.preventDefault();
    e.stopPropagation();
    isResizingSelection = true;
    resizeHandle = position;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  }

  /**
   * 处理调整大小
   */
  function handleResize(clientX, clientY) {
    const dx = clientX - dragStartX;
    const dy = clientY - dragStartY;
    dragStartX = clientX;
    dragStartY = clientY;

    const minSize = 20;

    switch (resizeHandle) {
      case 'nw':
        if (selectionWidth - dx >= minSize) {
          selectionLeft += dx;
          selectionWidth -= dx;
        }
        if (selectionHeight - dy >= minSize) {
          selectionTop += dy;
          selectionHeight -= dy;
        }
        break;
      case 'n':
        if (selectionHeight - dy >= minSize) {
          selectionTop += dy;
          selectionHeight -= dy;
        }
        break;
      case 'ne':
        if (selectionWidth + dx >= minSize) {
          selectionWidth += dx;
        }
        if (selectionHeight - dy >= minSize) {
          selectionTop += dy;
          selectionHeight -= dy;
        }
        break;
      case 'e':
        if (selectionWidth + dx >= minSize) {
          selectionWidth += dx;
        }
        break;
      case 'se':
        if (selectionWidth + dx >= minSize) {
          selectionWidth += dx;
        }
        if (selectionHeight + dy >= minSize) {
          selectionHeight += dy;
        }
        break;
      case 's':
        if (selectionHeight + dy >= minSize) {
          selectionHeight += dy;
        }
        break;
      case 'sw':
        if (selectionWidth - dx >= minSize) {
          selectionLeft += dx;
          selectionWidth -= dx;
        }
        if (selectionHeight + dy >= minSize) {
          selectionHeight += dy;
        }
        break;
      case 'w':
        if (selectionWidth - dx >= minSize) {
          selectionLeft += dx;
          selectionWidth -= dx;
        }
        break;
    }

    updateSelectionUI();
  }

  /**
   * 选区框鼠标按下事件（拖拽移动）
   */
  function onSelectionBoxMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSelection = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    selectionBox.style.setProperty('cursor', 'move', 'important');
  }

  /**
   * 进入选区调整模式
   */
  function enterAdjustMode() {
    isSelectionComplete = true;

    // 保存选区的视口坐标
    const left = Math.min(startDocX, currentDocX);
    const top = Math.min(startDocY, currentDocY);
    const width = Math.abs(currentDocX - startDocX);
    const height = Math.abs(currentDocY - startDocY);

    const viewCoords = docToClientCoords(left, top);
    selectionLeft = viewCoords.x;
    selectionTop = viewCoords.y;
    selectionWidth = width;
    selectionHeight = height;

    // 隐藏提示
    if (selectionHint) {
      selectionHint.style.setProperty('display', 'none', 'important');
    }

    // 选区框可以接受鼠标事件（用于拖拽）
    selectionBox.style.setProperty('pointer-events', 'auto', 'important');
    selectionBox.style.setProperty('cursor', 'move', 'important');
    selectionBox.addEventListener('mousedown', onSelectionBoxMouseDown);

    // 显示控制点和工具栏
    updateSelectionUI();
  }

  /**
   * 确认选区并截图
   */
  function confirmSelection() {
    // 停止自动滚动
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }

    // 将视口坐标转换回文档坐标
    const docCoords = clientToDocCoords(selectionLeft, selectionTop);
    const rect = {
      x: docCoords.x,
      y: docCoords.y,
      width: selectionWidth,
      height: selectionHeight
    };

    // 如果选区太小，忽略
    if (rect.width < 10 || rect.height < 10) {
      removeSelectionOverlay();
      return;
    }

    // 获取滚动容器信息
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
        viewportTop: containerRect.top,
        viewportLeft: containerRect.left,
        viewportWidth: containerRect.width,
        viewportHeight: containerRect.height
      };
    }

    // 发送选区信息到 background
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
    // 停止拖拽移动
    if (isDraggingSelection) {
      isDraggingSelection = false;
      selectionBox.style.setProperty('cursor', 'move', 'important');
      return;
    }

    // 停止调整大小
    if (isResizingSelection) {
      isResizingSelection = false;
      resizeHandle = null;
      return;
    }

    // 完成绘制选区
    if (isSelecting && !isSelectionComplete) {
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

      // 进入调整模式
      enterAdjustMode();
    }
  }

  /**
   * 键盘事件处理 - Escape 取消, Enter 确认
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
    } else if (e.key === 'Enter' && isSelectionComplete) {
      e.preventDefault();
      confirmSelection();
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
        background: white;
        color: #191919;
        padding: 14px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        animation: fadeIn 0.2s ease;
      `;

      const styleTag = document.createElement('style');
      styleTag.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
      progressContainer.appendChild(styleTag);

      progressContainer.innerHTML += `
        <span style="color: #888888;">截图中</span>
        <div style="width: 140px; height: 4px; background: #E5E5E5; border-radius: 2px; overflow: hidden;">
          <div id="scroll-capture-progress-bar" style="width: 0%; height: 100%; background: #07C160; border-radius: 2px; transition: width 0.3s ease;"></div>
        </div>
        <span id="scroll-capture-progress-text" style="font-weight: 500; min-width: 36px; text-align: right; color: #191919;">0%</span>
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

      case 'showBatchProgress':
        showBatchProgressPanel(message.current, message.total, message.status);
        sendResponse({ success: true });
        break;

      case 'showBatchResults':
        showBatchResultsPanel(message.results, message.format);
        sendResponse({ success: true });
        break;

      case 'hideBatchProgress':
        hideBatchProgressPanel();
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
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      animation: fadeIn 0.2s ease;
      overflow: hidden;
    `;

    const dimText = dimensions ? `${dimensions.width} × ${dimensions.height}` : '';

    previewPanel.innerHTML = `
      <style>
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      </style>
      <div style="padding: 14px 16px; border-bottom: 1px solid #EBEBEB; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 15px; font-weight: 500; color: #191919;">截图完成</span>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: #888888;">${dimText}</span>
          <button id="scroll-capture-close" style="background: transparent; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: #888888; font-size: 18px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
      </div>
      <div style="padding: 16px; overflow: auto; max-height: calc(90vh - 120px); background: #F5F5F5;">
        <img src="${dataUrl}" style="max-width: 100%; display: block; border-radius: 4px;" />
      </div>
      <div style="padding: 12px 16px; border-top: 1px solid #EBEBEB; display: flex; gap: 10px; justify-content: flex-end;">
        <button id="scroll-capture-copy" style="padding: 8px 16px; background: white; color: #191919; border: 1px solid #E5E5E5; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          复制
        </button>
        <button id="scroll-capture-save" style="padding: 8px 16px; background: #07C160; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          保存
        </button>
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
      animation: fadeIn 0.2s ease;
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    backdrop.appendChild(styleEl);
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
      background: rgba(25, 25, 25, 0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      animation: fadeIn 0.2s ease;
    `;
    toast.innerHTML = `
      ${message}
      <style>@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }</style>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 2000);
  }

  // ============================================
  // 3.5 批量截图进度和结果预览
  // ============================================

  let batchProgressPanel = null;
  let batchResultsPanel = null;
  let batchResultsData = [];
  let batchFormat = 'png';

  /**
   * 显示批量截图进度面板
   */
  function showBatchProgressPanel(current, total, status) {
    if (!batchProgressPanel) {
      batchProgressPanel = document.createElement('div');
      batchProgressPanel.id = 'scroll-capture-batch-progress';
      batchProgressPanel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        z-index: 2147483647;
        padding: 16px 20px;
        min-width: 260px;
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        animation: fadeIn 0.2s ease;
      `;

      const styleTag = document.createElement('style');
      styleTag.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
      batchProgressPanel.appendChild(styleTag);
      document.body.appendChild(batchProgressPanel);
    }

    const percent = Math.round((current / total) * 100);
    const statusText = status === 'capturing' ? '正在截图...' : '处理中...';

    batchProgressPanel.innerHTML = `
      <style>@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }</style>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <span style="font-size: 14px; color: #191919; font-weight: 500;">${statusText}</span>
        <span style="font-size: 12px; color: #888888;">${current} / ${total}</span>
      </div>
      <div style="background: #E5E5E5; border-radius: 2px; height: 4px; overflow: hidden; margin-bottom: 8px;">
        <div style="background: #07C160; height: 100%; width: ${percent}%; transition: width 0.3s;"></div>
      </div>
      <div style="text-align: center; font-size: 13px; color: #888888;">${percent}%</div>
    `;
  }

  /**
   * 隐藏批量截图进度面板
   */
  function hideBatchProgressPanel() {
    if (batchProgressPanel) {
      batchProgressPanel.remove();
      batchProgressPanel = null;
    }
  }

  /**
   * 显示批量截图结果面板
   */
  function showBatchResultsPanel(results, format) {
    hideBatchProgressPanel();
    removeBatchResultsPanel();

    batchResultsData = results;
    batchFormat = format || 'png';

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    // 创建背景遮罩
    const backdrop = document.createElement('div');
    backdrop.id = 'scroll-capture-batch-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483646;
      animation: fadeIn 0.2s ease;
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    backdrop.appendChild(styleEl);
    backdrop.addEventListener('click', removeBatchResultsPanel);
    document.body.appendChild(backdrop);

    // 创建结果面板
    batchResultsPanel = document.createElement('div');
    batchResultsPanel.id = 'scroll-capture-batch-results';
    batchResultsPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      width: 560px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      animation: fadeIn 0.2s ease;
      overflow: hidden;
    `;

    // 生成缩略图列表
    let thumbnailsHtml = '';
    results.forEach((result, index) => {
      if (result.success && result.dataUrl) {
        thumbnailsHtml += `
          <div class="batch-thumb" data-index="${index}" style="
            width: 120px;
            height: 80px;
            border-radius: 4px;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.2s;
            flex-shrink: 0;
            position: relative;
          ">
            <img src="${result.dataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
            <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 6px; background: linear-gradient(transparent, rgba(0,0,0,0.6)); color: white; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${result.title ? result.title.substring(0, 15) : ''}</div>
          </div>
        `;
      } else {
        thumbnailsHtml += `
          <div style="
            width: 120px;
            height: 80px;
            border-radius: 4px;
            background: #FEF0F0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FA5151;
            font-size: 12px;
            flex-shrink: 0;
          ">截图失败</div>
        `;
      }
    });

    batchResultsPanel.innerHTML = `
      <style>
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .batch-thumb:hover { border-color: #07C160 !important; }
      </style>
      <div style="padding: 16px 20px; border-bottom: 1px solid #EBEBEB; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 16px; font-weight: 500; color: #191919;">批量截图完成</span>
          <span style="font-size: 13px; color: #888888; margin-left: 12px;">成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}</span>
        </div>
        <button id="batch-close-btn" style="background: transparent; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: #888888; font-size: 20px; display: flex; align-items: center; justify-content: center;">×</button>
      </div>
      <div style="padding: 16px 20px; overflow-x: auto; border-bottom: 1px solid #EBEBEB; background: #F5F5F5;">
        <div style="display: flex; gap: 12px; min-width: max-content;">
          ${thumbnailsHtml}
        </div>
      </div>
      <div style="padding: 14px 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button id="batch-download-all-btn" style="
          padding: 8px 20px;
          background: #07C160;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          批量下载 (${successCount})
        </button>
      </div>
    `;

    document.body.appendChild(batchResultsPanel);

    // 绑定事件
    document.getElementById('batch-close-btn').addEventListener('click', removeBatchResultsPanel);
    document.getElementById('batch-download-all-btn').addEventListener('click', downloadAllBatchResults);

    // 缩略图点击预览
    batchResultsPanel.querySelectorAll('.batch-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const index = parseInt(thumb.dataset.index, 10);
        const result = batchResultsData[index];
        if (result && result.success && result.dataUrl) {
          showSinglePreview(result.dataUrl, result.dimensions, result.title);
        }
      });
    });

    document.addEventListener('keydown', onBatchResultsKeyDown);
  }

  /**
   * 移除批量结果面板
   */
  function removeBatchResultsPanel() {
    const backdrop = document.getElementById('scroll-capture-batch-backdrop');
    if (backdrop) backdrop.remove();
    if (batchResultsPanel) {
      batchResultsPanel.remove();
      batchResultsPanel = null;
    }
    batchResultsData = [];
    document.removeEventListener('keydown', onBatchResultsKeyDown);
  }

  /**
   * 批量结果面板键盘事件
   */
  function onBatchResultsKeyDown(e) {
    if (e.key === 'Escape') {
      removeBatchResultsPanel();
    }
  }

  /**
   * 显示单张预览（从批量结果中）
   */
  function showSinglePreview(dataUrl, dimensions, title) {
    // 临时隐藏批量结果面板
    if (batchResultsPanel) {
      batchResultsPanel.style.display = 'none';
    }

    const singlePreview = document.createElement('div');
    singlePreview.id = 'scroll-capture-single-preview';
    singlePreview.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2147483648;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      overflow: hidden;
      animation: fadeIn 0.2s ease;
    `;

    const dimText = dimensions ? `${dimensions.width} × ${dimensions.height}` : '';
    const titleText = title ? (title.length > 40 ? title.substring(0, 40) + '...' : title) : '';

    singlePreview.innerHTML = `
      <style>@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }</style>
      <div style="padding: 14px 16px; border-bottom: 1px solid #EBEBEB; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 14px; color: #191919; font-weight: 500;">${titleText}</span>
          <span style="font-size: 12px; color: #888888; margin-left: 10px;">${dimText}</span>
        </div>
        <button id="single-preview-close" style="background: transparent; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: #888888; font-size: 18px; display: flex; align-items: center; justify-content: center;">×</button>
      </div>
      <div style="padding: 16px; overflow: auto; max-height: calc(90vh - 60px); background: #F5F5F5;">
        <img src="${dataUrl}" style="max-width: 100%; display: block; border-radius: 4px;" />
      </div>
    `;

    document.body.appendChild(singlePreview);

    const closeBtn = document.getElementById('single-preview-close');
    const closeSinglePreview = () => {
      singlePreview.remove();
      if (batchResultsPanel) {
        batchResultsPanel.style.display = 'flex';
      }
    };
    closeBtn.addEventListener('click', closeSinglePreview);
  }

  /**
   * 批量下载所有成功的截图
   */
  async function downloadAllBatchResults() {
    const btn = document.getElementById('batch-download-all-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '下载中...';
    }

    let downloadCount = 0;
    for (const result of batchResultsData) {
      if (result.success && result.dataUrl) {
        const safeTitle = (result.title || 'screenshot')
          .replace(/[<>:"/\\|?*]/g, '_')
          .substring(0, 50);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `${safeTitle}_${timestamp}.${batchFormat}`;
        
        try {
          await chrome.runtime.sendMessage({
            action: 'download',
            dataUrl: result.dataUrl,
            filename: filename,
            format: batchFormat
          });
          downloadCount++;
          // 添加小延迟避免下载过快
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          console.error('Download failed:', err);
        }
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = `下载完成 (${downloadCount})`;
      setTimeout(() => {
        btn.textContent = `批量下载 (${batchResultsData.filter(r => r.success).length})`;
      }, 2000);
    }

    showToast(`已下载 ${downloadCount} 张截图`);
  }

})();
