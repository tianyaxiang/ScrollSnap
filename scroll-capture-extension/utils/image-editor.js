/**
 * Image Editor - 截图编辑器
 * 参考微信截图工具的编辑功能实现
 */

(function(global) {
  'use strict';

  // 编辑工具类型
  const TOOL_TYPES = {
    NONE: 'none',
    RECT: 'rect',           // 矩形
    ELLIPSE: 'ellipse',     // 椭圆
    ARROW: 'arrow',         // 箭头
    LINE: 'line',           // 直线
    PEN: 'pen',             // 画笔
    MARKER: 'marker',       // 马克笔（荧光笔）
    TEXT: 'text',           // 文字
    MOSAIC: 'mosaic',       // 马赛克
    BLUR: 'blur',           // 模糊
  };

  // 预设颜色
  const PRESET_COLORS = [
    '#FF3B30', // 红色
    '#FF9500', // 橙色
    '#FFCC00', // 黄色
    '#34C759', // 绿色
    '#007AFF', // 蓝色
    '#5856D6', // 紫色
    '#AF52DE', // 粉紫
    '#000000', // 黑色
    '#FFFFFF', // 白色
  ];

  // 预设线条宽度
  const STROKE_WIDTHS = [2, 4, 6, 8];

  // 美化模板类型
  const TEMPLATE_TYPES = {
    NONE: 'none',
    SHADOW: 'shadow',           // 阴影
    ROUNDED: 'rounded',         // 圆角
    BROWSER: 'browser',         // 浏览器窗口
    PHONE: 'phone',             // 手机框
    GRADIENT_BG: 'gradient_bg', // 渐变背景
    POLAROID: 'polaroid',       // 拍立得
  };

  /**
   * ImageEditor 类
   */
  class ImageEditor {
    constructor(options = {}) {
      this.container = null;
      this.canvas = null;
      this.ctx = null;
      this.imageData = null;
      this.originalImage = null;
      this.history = [];
      this.historyIndex = -1;
      this.maxHistory = 50;

      // 当前工具状态
      this.currentTool = TOOL_TYPES.NONE;
      this.currentColor = '#FF3B30';
      this.strokeWidth = 4;
      this.fontSize = 16;
      this.fillShape = false;

      // 绘制状态
      this.isDrawing = false;
      this.startX = 0;
      this.startY = 0;
      this.currentX = 0;
      this.currentY = 0;
      this.penPath = [];

      // 文字输入状态
      this.textInput = null;

      // 美化模板
      this.currentTemplate = TEMPLATE_TYPES.NONE;
      this.templatePadding = 40;

      // 回调
      this.onSave = options.onSave || null;
      this.onCancel = options.onCancel || null;
      this.onClose = options.onClose || null;

      // i18n
      this.getMessage = options.getMessage || ((key) => key);
    }

    /**
     * 初始化编辑器
     */
    async init(dataUrl, container) {
      this.container = container;

      // 加载图片
      this.originalImage = await this._loadImage(dataUrl);
      this.imageData = dataUrl;

      // 创建UI
      this._createUI();

      // 绑定事件
      this._bindEvents();

      // 初始化画布
      this._initCanvas();

      // 保存初始状态
      this._saveHistory();
    }

    /**
     * 加载图片
     */
    _loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      });
    }

    /**
     * 创建编辑器UI
     */
    _createUI() {
      const editorHTML = `
        <div class="sc-editor-overlay">
          <div class="sc-editor-container">
            <!-- 顶部工具栏 -->
            <div class="sc-editor-header">
              <div class="sc-editor-title">${this.getMessage('editorTitle')}</div>
              <div class="sc-editor-header-actions">
                <button class="sc-editor-btn sc-editor-btn-undo" title="${this.getMessage('editorUndo')}" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5 5M3 10l5-5"/>
                  </svg>
                </button>
                <button class="sc-editor-btn sc-editor-btn-redo" title="${this.getMessage('editorRedo')}" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-5 5M21 10l-5-5"/>
                  </svg>
                </button>
                <div class="sc-editor-divider"></div>
                <button class="sc-editor-btn sc-editor-btn-close" title="${this.getMessage('editorClose')}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- 画布区域 -->
            <div class="sc-editor-canvas-wrapper">
              <canvas class="sc-editor-canvas"></canvas>
            </div>

            <!-- 底部工具栏 -->
            <div class="sc-editor-toolbar">
              <!-- 绘图工具 -->
              <div class="sc-editor-tools">
                <button class="sc-editor-tool" data-tool="rect" title="${this.getMessage('editorRect')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="ellipse" title="${this.getMessage('editorEllipse')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <ellipse cx="12" cy="12" rx="10" ry="7"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="arrow" title="${this.getMessage('editorArrow')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 19L19 5M19 5v10M19 5H9"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="line" title="${this.getMessage('editorLine')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 19L19 5"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="pen" title="${this.getMessage('editorPen')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="marker" title="${this.getMessage('editorMarker')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l-6 6v3h3l6-6"/>
                    <path d="M14.5 4L20 9.5"/>
                    <path d="M13 6l5 5"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="text" title="${this.getMessage('editorText')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="mosaic" title="${this.getMessage('editorMosaic')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="6" height="6"/>
                    <rect x="15" y="3" width="6" height="6"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <rect x="3" y="15" width="6" height="6"/>
                    <rect x="15" y="15" width="6" height="6"/>
                  </svg>
                </button>
                <button class="sc-editor-tool" data-tool="blur" title="${this.getMessage('editorBlur')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                </button>
              </div>

              <div class="sc-editor-divider"></div>

              <!-- 美化模板 -->
              <div class="sc-editor-templates">
                <button class="sc-editor-template" data-template="shadow" title="${this.getMessage('editorTemplateShadow')}">
                  <div class="template-preview shadow-preview"></div>
                </button>
                <button class="sc-editor-template" data-template="rounded" title="${this.getMessage('editorTemplateRounded')}">
                  <div class="template-preview rounded-preview"></div>
                </button>
                <button class="sc-editor-template" data-template="browser" title="${this.getMessage('editorTemplateBrowser')}">
                  <div class="template-preview browser-preview"></div>
                </button>
                <button class="sc-editor-template" data-template="gradient_bg" title="${this.getMessage('editorTemplateGradient')}">
                  <div class="template-preview gradient-preview"></div>
                </button>
                <button class="sc-editor-template" data-template="polaroid" title="${this.getMessage('editorTemplatePolaroid')}">
                  <div class="template-preview polaroid-preview"></div>
                </button>
              </div>

              <div class="sc-editor-divider"></div>

              <!-- 颜色选择 -->
              <div class="sc-editor-colors">
                ${PRESET_COLORS.map(color => `
                  <button class="sc-editor-color${color === this.currentColor ? ' active' : ''}"
                          data-color="${color}"
                          style="background: ${color}; ${color === '#FFFFFF' ? 'border: 1px solid #ddd;' : ''}">
                  </button>
                `).join('')}
              </div>

              <div class="sc-editor-divider"></div>

              <!-- 线条粗细 -->
              <div class="sc-editor-strokes">
                ${STROKE_WIDTHS.map(w => `
                  <button class="sc-editor-stroke${w === this.strokeWidth ? ' active' : ''}" data-stroke="${w}">
                    <div style="width: ${w * 3}px; height: ${w}px; background: currentColor; border-radius: ${w/2}px;"></div>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- 底部操作按钮 -->
            <div class="sc-editor-footer">
              <button class="sc-editor-btn-secondary sc-editor-btn-cancel">${this.getMessage('editorCancel')}</button>
              <button class="sc-editor-btn-primary sc-editor-btn-save">${this.getMessage('editorSave')}</button>
            </div>
          </div>
        </div>
      `;

      // 创建样式
      const styleEl = document.createElement('style');
      styleEl.id = 'sc-editor-styles';
      styleEl.textContent = this._getStyles();

      // 创建容器
      const wrapper = document.createElement('div');
      wrapper.id = 'sc-editor-wrapper';
      wrapper.innerHTML = editorHTML;

      this.container.appendChild(styleEl);
      this.container.appendChild(wrapper);

      // 获取元素引用
      this.canvas = wrapper.querySelector('.sc-editor-canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.editorWrapper = wrapper;
    }

    /**
     * 获取编辑器样式
     */
    _getStyles() {
      return `
        .sc-editor-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: scEditorFadeIn 0.2s ease;
        }

        @keyframes scEditorFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .sc-editor-container {
          background: #1a1a1a;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          max-width: 95vw;
          max-height: 95vh;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .sc-editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #252525;
          border-bottom: 1px solid #333;
        }

        .sc-editor-title {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }

        .sc-editor-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .sc-editor-btn {
          background: transparent;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          transition: all 0.15s;
        }

        .sc-editor-btn:hover:not(:disabled) {
          background: #333;
          color: #fff;
        }

        .sc-editor-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .sc-editor-divider {
          width: 1px;
          height: 24px;
          background: #333;
          margin: 0 8px;
        }

        .sc-editor-canvas-wrapper {
          flex: 1;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: #0d0d0d;
          min-height: 300px;
          position: relative;
        }

        .sc-editor-canvas {
          max-width: 100%;
          max-height: 100%;
          background: #fff;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .sc-editor-toolbar {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: #252525;
          border-top: 1px solid #333;
          gap: 8px;
          flex-wrap: wrap;
        }

        .sc-editor-tools {
          display: flex;
          gap: 4px;
        }

        .sc-editor-tool {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #999;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .sc-editor-tool:hover {
          background: #333;
          color: #fff;
        }

        .sc-editor-tool.active {
          background: #07C160;
          color: #fff;
        }

        .sc-editor-templates {
          display: flex;
          gap: 6px;
        }

        .sc-editor-template {
          width: 36px;
          height: 36px;
          border: 2px solid transparent;
          border-radius: 6px;
          background: #333;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          transition: all 0.15s;
        }

        .sc-editor-template:hover {
          border-color: #555;
        }

        .sc-editor-template.active {
          border-color: #07C160;
        }

        .template-preview {
          width: 100%;
          height: 100%;
          border-radius: 2px;
          background: #666;
        }

        .shadow-preview {
          box-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }

        .rounded-preview {
          border-radius: 4px;
        }

        .browser-preview {
          position: relative;
        }

        .browser-preview::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: #888;
          border-radius: 2px 2px 0 0;
        }

        .gradient-preview {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .polaroid-preview {
          background: #fff;
          padding: 2px 2px 6px 2px;
        }

        .sc-editor-colors {
          display: flex;
          gap: 4px;
        }

        .sc-editor-color {
          width: 24px;
          height: 24px;
          border: 2px solid transparent;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.15s;
        }

        .sc-editor-color:hover {
          transform: scale(1.1);
        }

        .sc-editor-color.active {
          border-color: #07C160;
          box-shadow: 0 0 0 2px #1a1a1a;
        }

        .sc-editor-strokes {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .sc-editor-stroke {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #999;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .sc-editor-stroke:hover {
          background: #333;
          color: #fff;
        }

        .sc-editor-stroke.active {
          background: #333;
          color: #07C160;
        }

        .sc-editor-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 12px 16px;
          background: #252525;
          border-top: 1px solid #333;
        }

        .sc-editor-btn-secondary {
          padding: 8px 20px;
          border: 1px solid #555;
          border-radius: 6px;
          background: transparent;
          color: #ccc;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .sc-editor-btn-secondary:hover {
          background: #333;
          border-color: #666;
        }

        .sc-editor-btn-primary {
          padding: 8px 24px;
          border: none;
          border-radius: 6px;
          background: #07C160;
          color: #fff;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .sc-editor-btn-primary:hover {
          background: #06ae56;
        }

        /* 文字输入框 */
        .sc-editor-text-input {
          position: absolute;
          background: transparent;
          border: 2px dashed currentColor;
          outline: none;
          font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
          resize: none;
          min-width: 100px;
          min-height: 24px;
          padding: 4px 8px;
        }
      `;
    }

    /**
     * 初始化画布
     */
    _initCanvas() {
      const img = this.originalImage;
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
      const wrapper = this.editorWrapper;

      // 工���选择
      wrapper.querySelectorAll('.sc-editor-tool').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tool = e.currentTarget.dataset.tool;
          this._selectTool(tool);
        });
      });

      // 模板选择
      wrapper.querySelectorAll('.sc-editor-template').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const template = e.currentTarget.dataset.template;
          this._applyTemplate(template);
        });
      });

      // 颜色选择
      wrapper.querySelectorAll('.sc-editor-color').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const color = e.currentTarget.dataset.color;
          this._selectColor(color);
        });
      });

      // 线条粗细
      wrapper.querySelectorAll('.sc-editor-stroke').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const stroke = parseInt(e.currentTarget.dataset.stroke, 10);
          this._selectStroke(stroke);
        });
      });

      // 撤销/重做
      wrapper.querySelector('.sc-editor-btn-undo').addEventListener('click', () => this.undo());
      wrapper.querySelector('.sc-editor-btn-redo').addEventListener('click', () => this.redo());

      // 关闭/取消/保存
      wrapper.querySelector('.sc-editor-btn-close').addEventListener('click', () => this._close());
      wrapper.querySelector('.sc-editor-btn-cancel').addEventListener('click', () => this._cancel());
      wrapper.querySelector('.sc-editor-btn-save').addEventListener('click', () => this._save());

      // 画布事件
      this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
      this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
      this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));

      // 键盘事件
      document.addEventListener('keydown', this._onKeyDown.bind(this));
    }

    /**
     * 选择工具
     */
    _selectTool(tool) {
      this.currentTool = tool;

      // 更新UI
      this.editorWrapper.querySelectorAll('.sc-editor-tool').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
      });

      // 设置画布光标
      if (tool === TOOL_TYPES.NONE) {
        this.canvas.style.cursor = 'default';
      } else if (tool === TOOL_TYPES.TEXT) {
        this.canvas.style.cursor = 'text';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }

      // 移除文字输入框
      if (tool !== TOOL_TYPES.TEXT && this.textInput) {
        this._finishTextInput();
      }
    }

    /**
     * 选择颜色
     */
    _selectColor(color) {
      this.currentColor = color;

      this.editorWrapper.querySelectorAll('.sc-editor-color').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
      });
    }

    /**
     * 选择线条粗细
     */
    _selectStroke(stroke) {
      this.strokeWidth = stroke;

      this.editorWrapper.querySelectorAll('.sc-editor-stroke').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.stroke, 10) === stroke);
      });
    }

    /**
     * 应用美化模板
     */
    _applyTemplate(template) {
      // 切换模板
      if (this.currentTemplate === template) {
        this.currentTemplate = TEMPLATE_TYPES.NONE;
      } else {
        this.currentTemplate = template;
      }

      // 更新UI
      this.editorWrapper.querySelectorAll('.sc-editor-template').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.template === this.currentTemplate);
      });

      // 重绘画布
      this._applyTemplateToCanvas();
    }

    /**
     * 将模板应用到画布
     */
    _applyTemplateToCanvas() {
      const img = this.originalImage;
      const padding = this.templatePadding;

      // 根据模板计算新尺寸
      let newWidth, newHeight;
      let imgX, imgY, imgW, imgH;

      switch (this.currentTemplate) {
        case TEMPLATE_TYPES.SHADOW:
          newWidth = img.width + padding * 2;
          newHeight = img.height + padding * 2;
          imgX = padding;
          imgY = padding;
          imgW = img.width;
          imgH = img.height;
          break;

        case TEMPLATE_TYPES.ROUNDED:
          newWidth = img.width;
          newHeight = img.height;
          imgX = 0;
          imgY = 0;
          imgW = img.width;
          imgH = img.height;
          break;

        case TEMPLATE_TYPES.BROWSER:
          const barHeight = 40;
          newWidth = img.width + padding;
          newHeight = img.height + barHeight + padding;
          imgX = padding / 2;
          imgY = barHeight + padding / 2;
          imgW = img.width;
          imgH = img.height;
          break;

        case TEMPLATE_TYPES.GRADIENT_BG:
          newWidth = img.width + padding * 3;
          newHeight = img.height + padding * 3;
          imgX = padding * 1.5;
          imgY = padding * 1.5;
          imgW = img.width;
          imgH = img.height;
          break;

        case TEMPLATE_TYPES.POLAROID:
          const bottomPad = 60;
          newWidth = img.width + padding;
          newHeight = img.height + padding + bottomPad;
          imgX = padding / 2;
          imgY = padding / 2;
          imgW = img.width;
          imgH = img.height;
          break;

        default: // NONE
          newWidth = img.width;
          newHeight = img.height;
          imgX = 0;
          imgY = 0;
          imgW = img.width;
          imgH = img.height;
      }

      // 调整画布尺寸
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;

      // 清空并绘制背景
      this.ctx.clearRect(0, 0, newWidth, newHeight);

      // 绘制模板装饰
      switch (this.currentTemplate) {
        case TEMPLATE_TYPES.SHADOW:
          // 透明背景 + 阴影
          this.ctx.fillStyle = '#f5f5f5';
          this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          this.ctx.shadowBlur = 20;
          this.ctx.shadowOffsetX = 0;
          this.ctx.shadowOffsetY = 10;
          this.ctx.fillStyle = '#fff';
          this.ctx.fillRect(imgX, imgY, imgW, imgH);
          this.ctx.shadowColor = 'transparent';
          break;

        case TEMPLATE_TYPES.ROUNDED:
          // 圆角裁剪
          this.ctx.save();
          this._roundedRect(0, 0, newWidth, newHeight, 16);
          this.ctx.clip();
          break;

        case TEMPLATE_TYPES.BROWSER:
          // 浏览器窗口
          this.ctx.fillStyle = '#f5f5f5';
          this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          this.ctx.shadowBlur = 15;
          this.ctx.shadowOffsetY = 5;

          // 窗口背景
          this.ctx.fillStyle = '#fff';
          this._roundedRect(padding/2, padding/2, newWidth - padding, newHeight - padding, 8);
          this.ctx.fill();
          this.ctx.shadowColor = 'transparent';

          // 标题栏
          this.ctx.fillStyle = '#e8e8e8';
          this.ctx.beginPath();
          this.ctx.moveTo(padding/2 + 8, padding/2);
          this.ctx.lineTo(newWidth - padding/2 - 8, padding/2);
          this.ctx.quadraticCurveTo(newWidth - padding/2, padding/2, newWidth - padding/2, padding/2 + 8);
          this.ctx.lineTo(newWidth - padding/2, padding/2 + 40);
          this.ctx.lineTo(padding/2, padding/2 + 40);
          this.ctx.lineTo(padding/2, padding/2 + 8);
          this.ctx.quadraticCurveTo(padding/2, padding/2, padding/2 + 8, padding/2);
          this.ctx.closePath();
          this.ctx.fill();

          // 窗口按钮
          const btnY = padding/2 + 20;
          const btnX = padding/2 + 16;
          this.ctx.fillStyle = '#ff5f56';
          this.ctx.beginPath();
          this.ctx.arc(btnX, btnY, 6, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.fillStyle = '#ffbd2e';
          this.ctx.beginPath();
          this.ctx.arc(btnX + 20, btnY, 6, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.fillStyle = '#27c93f';
          this.ctx.beginPath();
          this.ctx.arc(btnX + 40, btnY, 6, 0, Math.PI * 2);
          this.ctx.fill();
          break;

        case TEMPLATE_TYPES.GRADIENT_BG:
          // 渐变背景
          const gradient = this.ctx.createLinearGradient(0, 0, newWidth, newHeight);
          gradient.addColorStop(0, '#667eea');
          gradient.addColorStop(1, '#764ba2');
          this.ctx.fillStyle = gradient;
          this.ctx.fillRect(0, 0, newWidth, newHeight);

          // 阴影
          this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          this.ctx.shadowBlur = 30;
          this.ctx.shadowOffsetY = 15;
          this.ctx.fillStyle = '#fff';
          this._roundedRect(imgX, imgY, imgW, imgH, 8);
          this.ctx.fill();
          this.ctx.shadowColor = 'transparent';
          break;

        case TEMPLATE_TYPES.POLAROID:
          // 拍立得
          this.ctx.fillStyle = '#f0f0f0';
          this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          this.ctx.shadowBlur = 20;
          this.ctx.shadowOffsetY = 8;
          this.ctx.fillStyle = '#fff';
          this.ctx.fillRect(padding/4, padding/4, newWidth - padding/2, newHeight - padding/2);
          this.ctx.shadowColor = 'transparent';
          break;
      }

      // 绘制图片
      this.ctx.drawImage(img, imgX, imgY, imgW, imgH);

      // 恢复裁剪
      if (this.currentTemplate === TEMPLATE_TYPES.ROUNDED) {
        this.ctx.restore();
      }

      // 保存历史
      this._saveHistory();
    }

    /**
     * 绘制圆角矩形路径
     */
    _roundedRect(x, y, width, height, radius) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + radius, y);
      this.ctx.lineTo(x + width - radius, y);
      this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      this.ctx.lineTo(x + width, y + height - radius);
      this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      this.ctx.lineTo(x + radius, y + height);
      this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      this.ctx.lineTo(x, y + radius);
      this.ctx.quadraticCurveTo(x, y, x + radius, y);
      this.ctx.closePath();
    }

    /**
     * 获取画布上的鼠标坐标
     */
    _getCanvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    /**
     * 鼠标按下
     */
    _onMouseDown(e) {
      if (this.currentTool === TOOL_TYPES.NONE) return;

      // 如果正在输入文字，点击画布其他位置会完成当前输入并开始新的输入
      if (this._isTextInputting && this.currentTool === TOOL_TYPES.TEXT) {
        this._finishTextInput();
      }

      const coords = this._getCanvasCoords(e);
      this.startX = coords.x;
      this.startY = coords.y;
      this.isDrawing = true;

      if (this.currentTool === TOOL_TYPES.TEXT) {
        e.preventDefault();
        e.stopPropagation();
        this._startTextInput(coords.x, coords.y);
        this.isDrawing = false;
        return;
      }

      if (this.currentTool === TOOL_TYPES.PEN || this.currentTool === TOOL_TYPES.MARKER) {
        this.penPath = [{ x: coords.x, y: coords.y }];
      }

      // 保存当前画布状态用于预览
      this._tempImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 鼠标移动
     */
    _onMouseMove(e) {
      if (!this.isDrawing) return;

      const coords = this._getCanvasCoords(e);
      this.currentX = coords.x;
      this.currentY = coords.y;

      // 恢复临时状态
      if (this._tempImageData) {
        this.ctx.putImageData(this._tempImageData, 0, 0);
      }

      // 绘制预览
      this._drawShape(false);

      if (this.currentTool === TOOL_TYPES.PEN || this.currentTool === TOOL_TYPES.MARKER) {
        this.penPath.push({ x: coords.x, y: coords.y });
      }
    }

    /**
     * 鼠标释放
     */
    _onMouseUp(e) {
      if (!this.isDrawing) return;
      this.isDrawing = false;

      const coords = this._getCanvasCoords(e);
      this.currentX = coords.x;
      this.currentY = coords.y;

      // 恢复临时状态
      if (this._tempImageData) {
        this.ctx.putImageData(this._tempImageData, 0, 0);
      }

      // 最终绘制
      this._drawShape(true);

      // 保存历史
      this._saveHistory();

      // 清理
      this._tempImageData = null;
      this.penPath = [];
    }

    /**
     * 绘��形状
     */
    _drawShape(isFinal) {
      const ctx = this.ctx;
      const x1 = this.startX;
      const y1 = this.startY;
      const x2 = this.currentX;
      const y2 = this.currentY;

      ctx.save();
      ctx.strokeStyle = this.currentColor;
      ctx.fillStyle = this.currentColor;
      ctx.lineWidth = this.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (this.currentTool) {
        case TOOL_TYPES.RECT:
          ctx.beginPath();
          ctx.rect(x1, y1, x2 - x1, y2 - y1);
          if (this.fillShape) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
          break;

        case TOOL_TYPES.ELLIPSE:
          const rx = Math.abs(x2 - x1) / 2;
          const ry = Math.abs(y2 - y1) / 2;
          const cx = x1 + (x2 - x1) / 2;
          const cy = y1 + (y2 - y1) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (this.fillShape) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
          break;

        case TOOL_TYPES.LINE:
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          break;

        case TOOL_TYPES.ARROW:
          this._drawArrow(ctx, x1, y1, x2, y2);
          break;

        case TOOL_TYPES.PEN:
          if (this.penPath.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.penPath[0].x, this.penPath[0].y);
            for (let i = 1; i < this.penPath.length; i++) {
              ctx.lineTo(this.penPath[i].x, this.penPath[i].y);
            }
            ctx.stroke();
          }
          break;

        case TOOL_TYPES.MARKER:
          if (this.penPath.length > 1) {
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = this.strokeWidth * 4;
            ctx.beginPath();
            ctx.moveTo(this.penPath[0].x, this.penPath[0].y);
            for (let i = 1; i < this.penPath.length; i++) {
              ctx.lineTo(this.penPath[i].x, this.penPath[i].y);
            }
            ctx.stroke();
          }
          break;

        case TOOL_TYPES.MOSAIC:
          if (isFinal) {
            this._applyMosaic(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          } else {
            // 预览时绘制选区框
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#07C160';
            ctx.lineWidth = 2;
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          }
          break;

        case TOOL_TYPES.BLUR:
          if (isFinal) {
            this._applyBlur(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          } else {
            // 预览时绘制选区框
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#07C160';
            ctx.lineWidth = 2;
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          }
          break;
      }

      ctx.restore();
    }

    /**
     * 绘制箭头
     */
    _drawArrow(ctx, fromX, fromY, toX, toY) {
      const headLen = this.strokeWidth * 4;
      const angle = Math.atan2(toY - fromY, toX - fromX);

      // 箭头主体
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // 箭头头部
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(
        toX - headLen * Math.cos(angle - Math.PI / 6),
        toY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        toX - headLen * Math.cos(angle + Math.PI / 6),
        toY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }

    /**
     * 应用马赛克效果
     */
    _applyMosaic(x, y, width, height) {
      if (width < 1 || height < 1) return;

      const blockSize = Math.max(8, Math.floor(this.strokeWidth * 2));
      const imageData = this.ctx.getImageData(x, y, width, height);
      const data = imageData.data;

      for (let by = 0; by < height; by += blockSize) {
        for (let bx = 0; bx < width; bx += blockSize) {
          let r = 0, g = 0, b = 0, count = 0;

          // 计算块内平均颜色
          for (let py = by; py < by + blockSize && py < height; py++) {
            for (let px = bx; px < bx + blockSize && px < width; px++) {
              const idx = (py * width + px) * 4;
              r += data[idx];
              g += data[idx + 1];
              b += data[idx + 2];
              count++;
            }
          }

          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          // 填充块
          for (let py = by; py < by + blockSize && py < height; py++) {
            for (let px = bx; px < bx + blockSize && px < width; px++) {
              const idx = (py * width + px) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
            }
          }
        }
      }

      this.ctx.putImageData(imageData, x, y);
    }

    /**
     * 应用模糊效果
     */
    _applyBlur(x, y, width, height) {
      if (width < 1 || height < 1) return;

      // 使用简单的多次重绘模拟模糊
      const iterations = 3;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      // 复制原区域
      tempCtx.drawImage(this.canvas, x, y, width, height, 0, 0, width, height);

      // 多次缩小再放大实现模糊
      for (let i = 0; i < iterations; i++) {
        const scale = 0.5;
        const sw = width * scale;
        const sh = height * scale;

        tempCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, sw, sh);
        tempCtx.drawImage(tempCanvas, 0, 0, sw, sh, 0, 0, width, height);
      }

      this.ctx.drawImage(tempCanvas, 0, 0, width, height, x, y, width, height);
    }

    /**
     * 开始文字输入
     */
    _startTextInput(x, y) {
      // 不需要检查 this.textInput，因为在 _onMouseDown 中已经调用 _finishTextInput 了

      const wrapper = this.editorWrapper.querySelector('.sc-editor-canvas-wrapper');
      const rect = this.canvas.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const scaleX = rect.width / this.canvas.width;
      const scaleY = rect.height / this.canvas.height;

      // 计算输入框位置（相对于 wrapper）
      const inputLeft = rect.left - wrapperRect.left + x * scaleX;
      const inputTop = rect.top - wrapperRect.top + y * scaleY;

      this.textInput = document.createElement('textarea');
      this.textInput.className = 'sc-editor-text-input';
      this.textInput.style.cssText = `
        position: absolute;
        left: ${inputLeft}px;
        top: ${inputTop}px;
        color: ${this.currentColor};
        font-size: ${Math.max(14, this.fontSize * scaleY)}px;
        z-index: 9999;
        background: rgba(255, 255, 255, 0.95);
        border: 2px dashed ${this.currentColor};
        outline: none;
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        resize: both;
        min-width: 120px;
        min-height: 32px;
        padding: 6px 8px;
        box-sizing: border-box;
        line-height: 1.4;
        pointer-events: auto;
      `;

      this.textInputX = x;
      this.textInputY = y;
      this._isTextInputting = true;

      wrapper.appendChild(this.textInput);

      // 阻止输入框上的 mousedown 事件冒泡，防止触发画布的事件
      this.textInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      // 使用多个延迟确保焦点
      this.textInput.focus();
      setTimeout(() => {
        if (this.textInput) {
          this.textInput.focus();
        }
      }, 0);
      setTimeout(() => {
        if (this.textInput) {
          this.textInput.focus();
        }
      }, 50);

      // 按 Enter+Ctrl/Cmd 完成输入，Escape 取消输入
      this._textInputKeyHandler = (e) => {
        e.stopPropagation(); // 阻止所有键盘事件冒泡
        if (e.key === 'Escape') {
          e.preventDefault();
          // 取消输入，不保存文字
          this.textInput.value = '';
          this._finishTextInput();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this._finishTextInput();
        }
      };
      this.textInput.addEventListener('keydown', this._textInputKeyHandler);
    }

    /**
     * 完成文字输入
     */
    _finishTextInput() {
      if (!this.textInput) return;

      const text = this.textInput.value.trim();
      if (text) {
        this.ctx.save();
        this.ctx.fillStyle = this.currentColor;
        this.ctx.font = `${this.fontSize}px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
        this.ctx.textBaseline = 'top';

        // 支持多行文字
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          this.ctx.fillText(line, this.textInputX, this.textInputY + i * (this.fontSize + 4));
        });

        this.ctx.restore();
        this._saveHistory();
      }

      this.textInput.remove();
      this.textInput = null;
      this._textInputKeyHandler = null;
      this._isTextInputting = false;
    }

    /**
     * 保存历史记录
     */
    _saveHistory() {
      // 删除当前位置之后的历史
      this.history = this.history.slice(0, this.historyIndex + 1);

      // 保存当前状态
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.history.push({
        imageData: imageData,
        width: this.canvas.width,
        height: this.canvas.height
      });

      // 限制历史记录数量
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      } else {
        this.historyIndex++;
      }

      this._updateHistoryButtons();
    }

    /**
     * 撤销
     */
    undo() {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        const state = this.history[this.historyIndex];
        this.canvas.width = state.width;
        this.canvas.height = state.height;
        this.ctx.putImageData(state.imageData, 0, 0);
        this._updateHistoryButtons();
      }
    }

    /**
     * 重做
     */
    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const state = this.history[this.historyIndex];
        this.canvas.width = state.width;
        this.canvas.height = state.height;
        this.ctx.putImageData(state.imageData, 0, 0);
        this._updateHistoryButtons();
      }
    }

    /**
     * 更新历史按钮状态
     */
    _updateHistoryButtons() {
      const undoBtn = this.editorWrapper.querySelector('.sc-editor-btn-undo');
      const redoBtn = this.editorWrapper.querySelector('.sc-editor-btn-redo');

      if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
      if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    /**
     * 键盘事件
     */
    _onKeyDown(e) {
      // 如果正在输入文字，不处理全局快捷键（除了在输入框的keydown中处理的）
      if (this._isTextInputting) {
        return;
      }

      // Ctrl/Cmd + Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
      // ESC 关闭
      if (e.key === 'Escape') {
        e.preventDefault();
        this._close();
      }
    }

    /**
     * 获取编辑后的图片数据
     */
    getImageDataUrl(format = 'png', quality = 0.92) {
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      return this.canvas.toDataURL(mimeType, quality);
    }

    /**
     * 保存
     */
    _save() {
      if (this.textInput) {
        this._finishTextInput();
      }

      const dataUrl = this.getImageDataUrl();
      if (this.onSave) {
        this.onSave(dataUrl, {
          width: this.canvas.width,
          height: this.canvas.height
        });
      }
      this.destroy();
    }

    /**
     * 取消
     */
    _cancel() {
      if (this.onCancel) {
        this.onCancel();
      }
      this.destroy();
    }

    /**
     * 关闭
     */
    _close() {
      if (this.onClose) {
        this.onClose();
      }
      this.destroy();
    }

    /**
     * 销毁编辑器
     */
    destroy() {
      document.removeEventListener('keydown', this._onKeyDown.bind(this));

      // 清理文字输入相关
      if (this.textInput) {
        this.textInput.remove();
        this.textInput = null;
      }
      this._textInputKeyHandler = null;
      this._isTextInputting = false;

      if (this.editorWrapper) {
        this.editorWrapper.remove();
      }

      const styleEl = document.getElementById('sc-editor-styles');
      if (styleEl) {
        styleEl.remove();
      }

      this.history = [];
      this.canvas = null;
      this.ctx = null;
    }
  }

  // 导出到 window 对象（供 content script 使用）
  if (typeof window !== 'undefined') {
    window.ImageEditor = ImageEditor;
    window.TOOL_TYPES = TOOL_TYPES;
    window.TEMPLATE_TYPES = TEMPLATE_TYPES;
  }

})(typeof window !== 'undefined' ? window : this);
