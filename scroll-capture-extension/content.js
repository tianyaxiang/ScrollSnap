// Content Script for Scroll Capture Extension

(function() {
  'use strict';

  // ============================================
  // 图片编辑器类 (ImageEditor)
  // ============================================

  // 编辑工具类型
  const TOOL_TYPES = {
    NONE: 'none',
    RECT: 'rect',
    ELLIPSE: 'ellipse',
    ARROW: 'arrow',
    LINE: 'line',
    PEN: 'pen',
    MARKER: 'marker',
    TEXT: 'text',
    MOSAIC: 'mosaic',
    BLUR: 'blur',
  };

  // 预设颜色
  const PRESET_COLORS = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
    '#007AFF', '#5856D6', '#AF52DE', '#000000', '#FFFFFF',
  ];

  // 预设线条宽度
  const STROKE_WIDTHS = [2, 4, 6, 8];

  // 美化模板类型
  const TEMPLATE_TYPES = {
    NONE: 'none',
    SHADOW: 'shadow',
    ROUNDED: 'rounded',
    BROWSER: 'browser',
    GRADIENT_BG: 'gradient_bg',
    POLAROID: 'polaroid',
  };

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
      this.currentTool = TOOL_TYPES.NONE;
      this.currentColor = '#FF3B30';
      this.strokeWidth = 4;
      this.fontSize = 16;
      this.fillShape = false;
      this.isDrawing = false;
      this.startX = 0;
      this.startY = 0;
      this.currentX = 0;
      this.currentY = 0;
      this.penPath = [];
      this.textInput = null;
      this.currentTemplate = TEMPLATE_TYPES.NONE;
      this.templatePadding = 40;
      this.onSave = options.onSave || null;
      this.onCancel = options.onCancel || null;
      this.onClose = options.onClose || null;
      this.getMessage = options.getMessage || ((key) => key);
      this._boundOnKeyDown = this._onKeyDown.bind(this);
    }

    async init(dataUrl, container) {
      this.container = container;
      this.originalImage = await this._loadImage(dataUrl);
      this.imageData = dataUrl;
      this._createUI();
      this._bindEvents();
      this._initCanvas();
      this._saveHistory();
    }

    _loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      });
    }

    _createUI() {
      const editorHTML = `
        <div class="sc-editor-overlay">
          <div class="sc-editor-container">
            <div class="sc-editor-header">
              <div class="sc-editor-title">${this.getMessage('editorTitle')}</div>
              <div class="sc-editor-header-actions">
                <button class="sc-editor-btn sc-editor-btn-undo" title="${this.getMessage('editorUndo')}" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5 5M3 10l5-5"/></svg>
                </button>
                <button class="sc-editor-btn sc-editor-btn-redo" title="${this.getMessage('editorRedo')}" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-5 5M21 10l-5-5"/></svg>
                </button>
                <div class="sc-editor-divider"></div>
                <span class="sc-editor-dimensions"></span>
                <div class="sc-editor-divider"></div>
                <button class="sc-editor-btn sc-editor-btn-close" title="${this.getMessage('editorClose')}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div class="sc-editor-canvas-wrapper"><canvas class="sc-editor-canvas"></canvas></div>
            <div class="sc-editor-toolbar">
              <div class="sc-editor-tools">
                <button class="sc-editor-tool" data-tool="rect" title="${this.getMessage('editorRect')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>
                <button class="sc-editor-tool" data-tool="ellipse" title="${this.getMessage('editorEllipse')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg></button>
                <button class="sc-editor-tool" data-tool="arrow" title="${this.getMessage('editorArrow')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5M19 5v10M19 5H9"/></svg></button>
                <button class="sc-editor-tool" data-tool="line" title="${this.getMessage('editorLine')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5"/></svg></button>
                <button class="sc-editor-tool" data-tool="pen" title="${this.getMessage('editorPen')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg></button>
                <button class="sc-editor-tool" data-tool="marker" title="${this.getMessage('editorMarker')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l-6 6v3h3l6-6"/><path d="M14.5 4L20 9.5"/><path d="M13 6l5 5"/></svg></button>
                <button class="sc-editor-tool" data-tool="text" title="${this.getMessage('editorText')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></button>
                <button class="sc-editor-tool" data-tool="mosaic" title="${this.getMessage('editorMosaic')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></svg></button>
                <button class="sc-editor-tool" data-tool="blur" title="${this.getMessage('editorBlur')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></button>
              </div>
              <div class="sc-editor-divider"></div>
              <div class="sc-editor-templates">
                <button class="sc-editor-template" data-template="shadow" title="${this.getMessage('editorTemplateShadow')}"><div class="template-preview shadow-preview"></div></button>
                <button class="sc-editor-template" data-template="rounded" title="${this.getMessage('editorTemplateRounded')}"><div class="template-preview rounded-preview"></div></button>
                <button class="sc-editor-template" data-template="browser" title="${this.getMessage('editorTemplateBrowser')}"><div class="template-preview browser-preview"></div></button>
                <button class="sc-editor-template" data-template="gradient_bg" title="${this.getMessage('editorTemplateGradient')}"><div class="template-preview gradient-preview"></div></button>
                <button class="sc-editor-template" data-template="polaroid" title="${this.getMessage('editorTemplatePolaroid')}"><div class="template-preview polaroid-preview"></div></button>
              </div>
              <div class="sc-editor-divider"></div>
              <div class="sc-editor-colors">
                ${PRESET_COLORS.map(color => `<button class="sc-editor-color${color === this.currentColor ? ' active' : ''}" data-color="${color}" style="background: ${color}; ${color === '#FFFFFF' ? 'border: 1px solid #ddd;' : ''}"></button>`).join('')}
              </div>
              <div class="sc-editor-divider"></div>
              <div class="sc-editor-strokes">
                ${STROKE_WIDTHS.map(w => `<button class="sc-editor-stroke${w === this.strokeWidth ? ' active' : ''}" data-stroke="${w}"><div style="width: ${w * 3}px; height: ${w}px; background: currentColor; border-radius: ${w/2}px;"></div></button>`).join('')}
              </div>
            </div>
            <div class="sc-editor-footer">
              <button class="sc-editor-btn-secondary sc-editor-btn-copy" title="${this.getMessage('editorCopyTooltip')}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                ${this.getMessage('btnCopy')}
              </button>
              <button class="sc-editor-btn-primary sc-editor-btn-save" title="${this.getMessage('editorSaveTooltip')}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                ${this.getMessage('btnSave')}
              </button>
            </div>
          </div>
        </div>
      `;
      const styleEl = document.createElement('style');
      styleEl.id = 'sc-editor-styles';
      styleEl.textContent = this._getStyles();
      const wrapper = document.createElement('div');
      wrapper.id = 'sc-editor-wrapper';
      wrapper.innerHTML = editorHTML;
      this.container.appendChild(styleEl);
      this.container.appendChild(wrapper);
      this.canvas = wrapper.querySelector('.sc-editor-canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.editorWrapper = wrapper;
    }

    _getStyles() {
      return `.sc-editor-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:2147483647;display:flex;align-items:center;justify-content:center;animation:scEditorFadeIn 0.2s ease;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}@keyframes scEditorFadeIn{from{opacity:0}to{opacity:1}}.sc-editor-container{background:#1a1a1a;border-radius:12px;display:flex;flex-direction:column;max-width:95vw;max-height:95vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.sc-editor-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#252525;border-bottom:1px solid #333}.sc-editor-title{color:#fff;font-size:14px;font-weight:500}.sc-editor-header-actions{display:flex;align-items:center;gap:4px}.sc-editor-dimensions{color:#888;font-size:12px}.sc-editor-btn{background:transparent;border:none;width:32px;height:32px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#999;transition:all 0.15s}.sc-editor-btn:hover:not(:disabled){background:#333;color:#fff}.sc-editor-btn:disabled{opacity:0.3;cursor:not-allowed}.sc-editor-divider{width:1px;height:24px;background:#333;margin:0 8px}.sc-editor-canvas-wrapper{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:20px;background:#0d0d0d;min-height:300px;position:relative}.sc-editor-canvas{max-width:100%;max-height:100%;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.3)}.sc-editor-toolbar{display:flex;align-items:center;padding:12px 16px;background:#252525;border-top:1px solid #333;gap:8px;flex-wrap:wrap}.sc-editor-tools{display:flex;gap:4px}.sc-editor-tool{width:36px;height:36px;border:none;border-radius:6px;background:transparent;color:#999;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s}.sc-editor-tool:hover{background:#333;color:#fff}.sc-editor-tool.active{background:#07C160;color:#fff}.sc-editor-templates{display:flex;gap:6px}.sc-editor-template{width:36px;height:36px;border:2px solid transparent;border-radius:6px;background:#333;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;transition:all 0.15s}.sc-editor-template:hover{border-color:#555}.sc-editor-template.active{border-color:#07C160}.template-preview{width:100%;height:100%;border-radius:2px;background:#666}.shadow-preview{box-shadow:2px 2px 4px rgba(0,0,0,0.5)}.rounded-preview{border-radius:4px}.browser-preview{position:relative}.browser-preview::before{content:'';position:absolute;top:0;left:0;right:0;height:6px;background:#888;border-radius:2px 2px 0 0}.gradient-preview{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}.polaroid-preview{background:#fff;padding:2px 2px 6px 2px}.sc-editor-colors{display:flex;gap:4px}.sc-editor-color{width:24px;height:24px;border:2px solid transparent;border-radius:50%;cursor:pointer;transition:all 0.15s}.sc-editor-color:hover{transform:scale(1.1)}.sc-editor-color.active{border-color:#07C160;box-shadow:0 0 0 2px #1a1a1a}.sc-editor-strokes{display:flex;gap:4px;align-items:center}.sc-editor-stroke{width:32px;height:32px;border:none;border-radius:6px;background:transparent;color:#999;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s}.sc-editor-stroke:hover{background:#333;color:#fff}.sc-editor-stroke.active{background:#333;color:#07C160}.sc-editor-footer{display:flex;justify-content:flex-end;gap:12px;padding:12px 16px;background:#252525;border-top:1px solid #333}.sc-editor-btn-secondary{padding:8px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;font-size:14px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:6px}.sc-editor-btn-secondary:hover{background:#333;border-color:#666}.sc-editor-btn-primary{padding:8px 20px;border:none;border-radius:6px;background:#07C160;color:#fff;font-size:14px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:6px}.sc-editor-btn-primary:hover{background:#06ae56}.sc-editor-text-input{position:absolute;background:transparent;border:2px dashed currentColor;outline:none;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;resize:none;min-width:100px;min-height:24px;padding:4px 8px}.sc-editor-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;z-index:2147483648;animation:scToastIn 0.2s ease}@keyframes scToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
    }

    _initCanvas() {
      const img = this.originalImage;
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      this._updateDimensions();
    }

    _updateDimensions() {
      const dimEl = this.editorWrapper.querySelector('.sc-editor-dimensions');
      if (dimEl) dimEl.textContent = `${this.canvas.width} × ${this.canvas.height}`;
    }

    _bindEvents() {
      const wrapper = this.editorWrapper;
      wrapper.querySelectorAll('.sc-editor-tool').forEach(btn => btn.addEventListener('click', (e) => this._selectTool(e.currentTarget.dataset.tool)));
      wrapper.querySelectorAll('.sc-editor-template').forEach(btn => btn.addEventListener('click', (e) => this._applyTemplate(e.currentTarget.dataset.template)));
      wrapper.querySelectorAll('.sc-editor-color').forEach(btn => btn.addEventListener('click', (e) => this._selectColor(e.currentTarget.dataset.color)));
      wrapper.querySelectorAll('.sc-editor-stroke').forEach(btn => btn.addEventListener('click', (e) => this._selectStroke(parseInt(e.currentTarget.dataset.stroke, 10))));
      wrapper.querySelector('.sc-editor-btn-undo').addEventListener('click', () => this.undo());
      wrapper.querySelector('.sc-editor-btn-redo').addEventListener('click', () => this.redo());
      wrapper.querySelector('.sc-editor-btn-close').addEventListener('click', () => this._close());
      wrapper.querySelector('.sc-editor-btn-copy').addEventListener('click', () => this._copyToClipboard());
      wrapper.querySelector('.sc-editor-btn-save').addEventListener('click', () => this._save());
      this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
      this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
      this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e));
      document.addEventListener('keydown', this._boundOnKeyDown);
    }

    _selectTool(tool) {
      this.currentTool = tool;
      this.editorWrapper.querySelectorAll('.sc-editor-tool').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
      this.canvas.style.cursor = tool === TOOL_TYPES.NONE ? 'default' : tool === TOOL_TYPES.TEXT ? 'text' : 'crosshair';
      if (tool !== TOOL_TYPES.TEXT && this.textInput) this._finishTextInput();
    }

    _selectColor(color) {
      this.currentColor = color;
      this.editorWrapper.querySelectorAll('.sc-editor-color').forEach(btn => btn.classList.toggle('active', btn.dataset.color === color));
    }

    _selectStroke(stroke) {
      this.strokeWidth = stroke;
      this.editorWrapper.querySelectorAll('.sc-editor-stroke').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.stroke, 10) === stroke));
    }

    _applyTemplate(template) {
      this.currentTemplate = this.currentTemplate === template ? TEMPLATE_TYPES.NONE : template;
      this.editorWrapper.querySelectorAll('.sc-editor-template').forEach(btn => btn.classList.toggle('active', btn.dataset.template === this.currentTemplate));
      this._applyTemplateToCanvas();
    }

    _applyTemplateToCanvas() {
      const img = this.originalImage;
      const padding = this.templatePadding;
      let newWidth, newHeight, imgX, imgY, imgW = img.width, imgH = img.height;

      switch (this.currentTemplate) {
        case TEMPLATE_TYPES.SHADOW: newWidth = img.width + padding * 2; newHeight = img.height + padding * 2; imgX = padding; imgY = padding; break;
        case TEMPLATE_TYPES.ROUNDED: newWidth = img.width; newHeight = img.height; imgX = 0; imgY = 0; break;
        case TEMPLATE_TYPES.BROWSER: newWidth = img.width + padding; newHeight = img.height + 40 + padding; imgX = padding / 2; imgY = 40 + padding / 2; break;
        case TEMPLATE_TYPES.GRADIENT_BG: newWidth = img.width + padding * 3; newHeight = img.height + padding * 3; imgX = padding * 1.5; imgY = padding * 1.5; break;
        case TEMPLATE_TYPES.POLAROID: newWidth = img.width + padding; newHeight = img.height + padding + 60; imgX = padding / 2; imgY = padding / 2; break;
        default: newWidth = img.width; newHeight = img.height; imgX = 0; imgY = 0;
      }

      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.ctx.clearRect(0, 0, newWidth, newHeight);

      switch (this.currentTemplate) {
        case TEMPLATE_TYPES.SHADOW:
          this.ctx.fillStyle = '#f5f5f5'; this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0,0,0,0.3)'; this.ctx.shadowBlur = 20; this.ctx.shadowOffsetY = 10;
          this.ctx.fillStyle = '#fff'; this.ctx.fillRect(imgX, imgY, imgW, imgH);
          this.ctx.shadowColor = 'transparent'; break;
        case TEMPLATE_TYPES.ROUNDED:
          this.ctx.save(); this._roundedRect(0, 0, newWidth, newHeight, 16); this.ctx.clip(); break;
        case TEMPLATE_TYPES.BROWSER:
          this.ctx.fillStyle = '#f5f5f5'; this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0,0,0,0.2)'; this.ctx.shadowBlur = 15; this.ctx.shadowOffsetY = 5;
          this.ctx.fillStyle = '#fff'; this._roundedRect(padding/2, padding/2, newWidth - padding, newHeight - padding, 8); this.ctx.fill();
          this.ctx.shadowColor = 'transparent';
          this.ctx.fillStyle = '#e8e8e8'; this.ctx.beginPath();
          this.ctx.moveTo(padding/2 + 8, padding/2); this.ctx.lineTo(newWidth - padding/2 - 8, padding/2);
          this.ctx.quadraticCurveTo(newWidth - padding/2, padding/2, newWidth - padding/2, padding/2 + 8);
          this.ctx.lineTo(newWidth - padding/2, padding/2 + 40); this.ctx.lineTo(padding/2, padding/2 + 40);
          this.ctx.lineTo(padding/2, padding/2 + 8); this.ctx.quadraticCurveTo(padding/2, padding/2, padding/2 + 8, padding/2);
          this.ctx.closePath(); this.ctx.fill();
          const btnY = padding/2 + 20, btnX = padding/2 + 16;
          this.ctx.fillStyle = '#ff5f56'; this.ctx.beginPath(); this.ctx.arc(btnX, btnY, 6, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.fillStyle = '#ffbd2e'; this.ctx.beginPath(); this.ctx.arc(btnX + 20, btnY, 6, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.fillStyle = '#27c93f'; this.ctx.beginPath(); this.ctx.arc(btnX + 40, btnY, 6, 0, Math.PI * 2); this.ctx.fill();
          break;
        case TEMPLATE_TYPES.GRADIENT_BG:
          const gradient = this.ctx.createLinearGradient(0, 0, newWidth, newHeight);
          gradient.addColorStop(0, '#667eea'); gradient.addColorStop(1, '#764ba2');
          this.ctx.fillStyle = gradient; this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0,0,0,0.3)'; this.ctx.shadowBlur = 30; this.ctx.shadowOffsetY = 15;
          this.ctx.fillStyle = '#fff'; this._roundedRect(imgX, imgY, imgW, imgH, 8); this.ctx.fill();
          this.ctx.shadowColor = 'transparent'; break;
        case TEMPLATE_TYPES.POLAROID:
          this.ctx.fillStyle = '#f0f0f0'; this.ctx.fillRect(0, 0, newWidth, newHeight);
          this.ctx.shadowColor = 'rgba(0,0,0,0.2)'; this.ctx.shadowBlur = 20; this.ctx.shadowOffsetY = 8;
          this.ctx.fillStyle = '#fff'; this.ctx.fillRect(padding/4, padding/4, newWidth - padding/2, newHeight - padding/2);
          this.ctx.shadowColor = 'transparent'; break;
      }

      this.ctx.drawImage(img, imgX, imgY, imgW, imgH);
      if (this.currentTemplate === TEMPLATE_TYPES.ROUNDED) this.ctx.restore();
      this._saveHistory();
    }

    _roundedRect(x, y, width, height, radius) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + radius, y); this.ctx.lineTo(x + width - radius, y);
      this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      this.ctx.lineTo(x + width, y + height - radius);
      this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      this.ctx.lineTo(x + radius, y + height);
      this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      this.ctx.lineTo(x, y + radius);
      this.ctx.quadraticCurveTo(x, y, x + radius, y);
      this.ctx.closePath();
    }

    _getCanvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (this.canvas.width / rect.width), y: (e.clientY - rect.top) * (this.canvas.height / rect.height) };
    }

    _onMouseDown(e) {
      if (this.currentTool === TOOL_TYPES.NONE) return;
      // 如果正在输入文字且当前是文字工具，先完成输入
      if (this._isTextInputting && this.currentTool === TOOL_TYPES.TEXT) {
        this._finishTextInput();
      }
      const coords = this._getCanvasCoords(e);
      this.startX = coords.x; this.startY = coords.y; this.isDrawing = true;
      if (this.currentTool === TOOL_TYPES.TEXT) {
        e.preventDefault(); e.stopPropagation();
        this._startTextInput(coords.x, coords.y);
        this.isDrawing = false;
        return;
      }
      if (this.currentTool === TOOL_TYPES.PEN || this.currentTool === TOOL_TYPES.MARKER) this.penPath = [{ x: coords.x, y: coords.y }];
      this._tempImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    _onMouseMove(e) {
      if (!this.isDrawing) return;
      const coords = this._getCanvasCoords(e);
      this.currentX = coords.x; this.currentY = coords.y;
      if (this._tempImageData) this.ctx.putImageData(this._tempImageData, 0, 0);
      this._drawShape(false);
      if (this.currentTool === TOOL_TYPES.PEN || this.currentTool === TOOL_TYPES.MARKER) this.penPath.push({ x: coords.x, y: coords.y });
    }

    _onMouseUp(e) {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const coords = this._getCanvasCoords(e);
      this.currentX = coords.x; this.currentY = coords.y;
      if (this._tempImageData) this.ctx.putImageData(this._tempImageData, 0, 0);
      this._drawShape(true);
      this._saveHistory();
      this._tempImageData = null; this.penPath = [];
    }

    _drawShape(isFinal) {
      const ctx = this.ctx, x1 = this.startX, y1 = this.startY, x2 = this.currentX, y2 = this.currentY;
      ctx.save(); ctx.strokeStyle = this.currentColor; ctx.fillStyle = this.currentColor;
      ctx.lineWidth = this.strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      switch (this.currentTool) {
        case TOOL_TYPES.RECT: ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1); this.fillShape ? ctx.fill() : ctx.stroke(); break;
        case TOOL_TYPES.ELLIPSE:
          const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
          ctx.beginPath(); ctx.ellipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rx, ry, 0, 0, Math.PI * 2);
          this.fillShape ? ctx.fill() : ctx.stroke(); break;
        case TOOL_TYPES.LINE: ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); break;
        case TOOL_TYPES.ARROW: this._drawArrow(ctx, x1, y1, x2, y2); break;
        case TOOL_TYPES.PEN:
          if (this.penPath.length > 1) { ctx.beginPath(); ctx.moveTo(this.penPath[0].x, this.penPath[0].y); for (let i = 1; i < this.penPath.length; i++) ctx.lineTo(this.penPath[i].x, this.penPath[i].y); ctx.stroke(); } break;
        case TOOL_TYPES.MARKER:
          if (this.penPath.length > 1) { ctx.globalAlpha = 0.4; ctx.lineWidth = this.strokeWidth * 4; ctx.beginPath(); ctx.moveTo(this.penPath[0].x, this.penPath[0].y); for (let i = 1; i < this.penPath.length; i++) ctx.lineTo(this.penPath[i].x, this.penPath[i].y); ctx.stroke(); } break;
        case TOOL_TYPES.MOSAIC:
          if (isFinal) this._applyMosaic(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          else { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#07C160'; ctx.lineWidth = 2; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); } break;
        case TOOL_TYPES.BLUR:
          if (isFinal) this._applyBlur(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          else { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#07C160'; ctx.lineWidth = 2; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); } break;
      }
      ctx.restore();
    }

    _drawArrow(ctx, fromX, fromY, toX, toY) {
      const headLen = this.strokeWidth * 4, angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }

    _applyMosaic(x, y, width, height) {
      if (width < 1 || height < 1) return;
      const blockSize = Math.max(8, Math.floor(this.strokeWidth * 2));
      const imageData = this.ctx.getImageData(x, y, width, height), data = imageData.data;
      for (let by = 0; by < height; by += blockSize) {
        for (let bx = 0; bx < width; bx += blockSize) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let py = by; py < by + blockSize && py < height; py++) {
            for (let px = bx; px < bx + blockSize && px < width; px++) {
              const idx = (py * width + px) * 4; r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++;
            }
          }
          r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
          for (let py = by; py < by + blockSize && py < height; py++) {
            for (let px = bx; px < bx + blockSize && px < width; px++) {
              const idx = (py * width + px) * 4; data[idx] = r; data[idx + 1] = g; data[idx + 2] = b;
            }
          }
        }
      }
      this.ctx.putImageData(imageData, x, y);
    }

    _applyBlur(x, y, width, height) {
      if (width < 1 || height < 1) return;
      const tempCanvas = document.createElement('canvas'); tempCanvas.width = width; tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(this.canvas, x, y, width, height, 0, 0, width, height);
      for (let i = 0; i < 3; i++) { const sw = width * 0.5, sh = height * 0.5; tempCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, sw, sh); tempCtx.drawImage(tempCanvas, 0, 0, sw, sh, 0, 0, width, height); }
      this.ctx.drawImage(tempCanvas, 0, 0, width, height, x, y, width, height);
    }

    _startTextInput(x, y) {
      if (this.textInput) this._finishTextInput();
      const wrapper = this.editorWrapper.querySelector('.sc-editor-canvas-wrapper');
      const rect = this.canvas.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const scaleX = rect.width / this.canvas.width, scaleY = rect.height / this.canvas.height;
      this.textInput = document.createElement('textarea');
      this.textInput.className = 'sc-editor-text-input';
      const inputLeft = rect.left - wrapperRect.left + x * scaleX;
      const inputTop = rect.top - wrapperRect.top + y * scaleY;
      this.textInput.style.cssText = `position:absolute;left:${inputLeft}px;top:${inputTop}px;color:${this.currentColor};font-size:${Math.max(14, this.fontSize * scaleY)}px;z-index:9999;background:rgba(255,255,255,0.95);border:2px dashed ${this.currentColor};min-width:120px;min-height:32px;padding:6px 8px;box-sizing:border-box;outline:none;resize:both;`;
      this.textInputX = x; this.textInputY = y;
      this._isTextInputting = true;
      wrapper.appendChild(this.textInput);
      // 阻止 mousedown 冒泡
      this.textInput.addEventListener('mousedown', (e) => e.stopPropagation());
      // 延迟聚焦
      setTimeout(() => { if (this.textInput) this.textInput.focus(); }, 10);
      // 键盘事件
      this.textInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); this.textInput.value = ''; this._finishTextInput(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._finishTextInput(); }
      });
    }

    _finishTextInput() {
      if (!this.textInput) return;
      const text = this.textInput.value.trim();
      if (text) {
        this.ctx.save(); this.ctx.fillStyle = this.currentColor;
        this.ctx.font = `${this.fontSize}px -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif`;
        this.ctx.textBaseline = 'top';
        text.split('\n').forEach((line, i) => this.ctx.fillText(line, this.textInputX, this.textInputY + i * (this.fontSize + 4)));
        this.ctx.restore(); this._saveHistory();
      }
      this.textInput.remove(); this.textInput = null;
      this._isTextInputting = false;
    }

    _saveHistory() {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push({ imageData: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height), width: this.canvas.width, height: this.canvas.height });
      if (this.history.length > this.maxHistory) this.history.shift(); else this.historyIndex++;
      this._updateHistoryButtons();
    }

    undo() { if (this.historyIndex > 0) { this.historyIndex--; const s = this.history[this.historyIndex]; this.canvas.width = s.width; this.canvas.height = s.height; this.ctx.putImageData(s.imageData, 0, 0); this._updateHistoryButtons(); this._updateDimensions(); } }
    redo() { if (this.historyIndex < this.history.length - 1) { this.historyIndex++; const s = this.history[this.historyIndex]; this.canvas.width = s.width; this.canvas.height = s.height; this.ctx.putImageData(s.imageData, 0, 0); this._updateHistoryButtons(); this._updateDimensions(); } }

    _updateHistoryButtons() {
      const undoBtn = this.editorWrapper.querySelector('.sc-editor-btn-undo'), redoBtn = this.editorWrapper.querySelector('.sc-editor-btn-redo');
      if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
      if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    _onKeyDown(e) {
      if (this._isTextInputting) return; // 输入文字时不处理全局快捷键
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this._save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection().toString()) { e.preventDefault(); this._copyToClipboard(); }
      if (e.key === 'Escape') { e.preventDefault(); this._close(); }
    }

    _showToast(message) {
      const existing = document.querySelector('.sc-editor-toast');
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.className = 'sc-editor-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    getImageDataUrl(format = 'png', quality = 0.92) { return this.canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', quality); }

    async _copyToClipboard() {
      if (this.textInput) this._finishTextInput();
      try {
        const pngBlob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        this._showToast(this.getMessage('copySuccess'));
      } catch (err) {
        console.error('[ScrollCapture] Copy failed:', err);
        this._showToast('复制失败');
      }
    }

    async _save() {
      if (this.textInput) this._finishTextInput();
      try {
        const dataUrl = this.getImageDataUrl();
        await chrome.runtime.sendMessage({ action: 'download', dataUrl: dataUrl, format: 'png' });
        this._showToast(this.getMessage('saveSuccess'));
      } catch (err) {
        console.error('[ScrollCapture] Save failed:', err);
        this._showToast('保存失败');
      }
    }

    _close() { if (this.onClose) this.onClose(); this.destroy(); }

    destroy() {
      document.removeEventListener('keydown', this._boundOnKeyDown);
      if (this.editorWrapper) this.editorWrapper.remove();
      const styleEl = document.getElementById('sc-editor-styles'); if (styleEl) styleEl.remove();
      this.history = []; this.canvas = null; this.ctx = null;
    }
  }

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
    selectionHint.textContent = (window.i18n && window.i18n.getMessage('selectionHint')) || '拖动选择区域，滚动可扩展选区 | ESC 取消';

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
  // 3.4 截图预览与编辑
  // ============================================

  /**
   * 显示截图预览（直接打开编辑器）
   */
  function showPreviewPanel(dataUrl, dimensions) {
    openImageEditor(dataUrl, dimensions);
  }

  /**
   * 打开图片编辑器
   */
  async function openImageEditor(dataUrl, dimensions) {
    if (!dataUrl) return;

    // 确保 i18n 系统已初始化
    if (window.i18n && window.i18n.initI18n) {
      try {
        await window.i18n.initI18n();
      } catch (e) {
        console.warn('[ScrollCapture] i18n init failed:', e);
      }
    }

    // 内置的后备语言包
    const fallbackMessages = {
      editorTitle: '编辑截图',
      editorUndo: '撤销 (Ctrl+Z)',
      editorRedo: '重做 (Ctrl+Shift+Z)',
      editorClose: '关闭 (ESC)',
      editorRect: '矩形',
      editorEllipse: '椭圆',
      editorArrow: '箭头',
      editorLine: '直线',
      editorPen: '画笔',
      editorMarker: '马克笔',
      editorText: '文字',
      editorMosaic: '马赛克',
      editorBlur: '模糊',
      editorTemplateShadow: '阴影效果',
      editorTemplateRounded: '圆角效果',
      editorTemplateBrowser: '浏览器窗口',
      editorTemplateGradient: '渐变背景',
      editorTemplatePolaroid: '拍立得效果',
      editorCopyTooltip: '复制到剪贴板 (Ctrl+C)',
      editorSaveTooltip: '保存到本地 (Ctrl+S)',
      btnCopy: '复制',
      btnSave: '保存',
      copySuccess: '已复制到剪贴板',
      saveSuccess: '已保存'
    };

    // 获取 i18n 消息的辅助函数
    const getMessage = (key) => {
      // 优先使用 i18n 系统
      if (window.i18n && typeof window.i18n.getMessage === 'function') {
        const msg = window.i18n.getMessage(key);
        if (msg && msg !== key) {
          return msg;
        }
      }
      // 使用内置后备
      return fallbackMessages[key] || key;
    };

    try {
      const editor = new ImageEditor({
        getMessage: getMessage,
        onClose: () => {
          // 编辑器关闭后不需要做任何事
        }
      });

      await editor.init(dataUrl, document.body);
    } catch (err) {
      console.error('[ScrollCapture] Editor init error:', err);
      showToast('编辑器初始化失败');
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
