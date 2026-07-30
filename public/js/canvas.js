class Canvas {
  constructor(canvasId, toolbarId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.drawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.color = '#1A1A1A';
    this.size = 6;
    this.enabled = false;
    this.activeTool = 'pen'; // 'pen' or 'fill'
    this.onDraw = null;
    this.onClear = null;

    this.resize();
    this.setupTools(toolbarId);
    this.setupEvents();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const wrapper = this.canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.redraw();
  }

  enable(onDraw, onClear) {
    this.enabled = true;
    this.onDraw = onDraw;
    this.onClear = onClear;
    this.updateCursor();
  }

  disable() {
    this.enabled = false;
    this.onDraw = null;
    this.onClear = null;
    this.drawing = false;
    this.canvas.style.cursor = 'default';
  }

  updateCursor() {
    if (!this.enabled) return;
    this.canvas.style.cursor = this.activeTool === 'fill' ? 'cell' : 'crosshair';
  }

  setupTools(toolbarId) {
    const toolbar = document.getElementById(toolbarId);

    toolbar.querySelectorAll('.clr').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.clr').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.color = btn.dataset.color;
      });
    });

    toolbar.querySelectorAll('.tool').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTool = btn.dataset.tool;
        this.updateCursor();
      });
    });

    toolbar.querySelectorAll('.sz').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.sz').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.size = parseInt(btn.dataset.size);
      });
    });

    document.getElementById('clear-canvas-btn').addEventListener('click', () => {
      if (!this.enabled) return;
      this.clear();
      if (this.onClear) this.onClear();
    });
  }

  setupEvents() {
    const c = this.canvas;
    let onDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();

      if (this.activeTool === 'fill') {
        const pos = this.getPos(e);
        const pixelX = Math.floor(pos.x * this.canvas.width);
        const pixelY = Math.floor(pos.y * this.canvas.height);
        this.floodFill(pixelX, pixelY, this.color);
        if (this.onDraw) {
          this.onDraw(0, 0, pos.x, pos.y, this.color, 0, 'fill');
        }
        return;
      }

      this.drawing = true;
      const pos = this.getPos(e);
      this.lastX = pos.x;
      this.lastY = pos.y;
    };

    let onMove = (e) => {
      if (!this.drawing || !this.enabled) return;
      e.preventDefault();
      const pos = this.getPos(e);
      
      const pixelX = pos.x * this.canvas.width;
      const pixelY = pos.y * this.canvas.height;
      const pixelLastX = this.lastX * this.canvas.width;
      const pixelLastY = this.lastY * this.canvas.height;

      this.ctx.beginPath();
      this.ctx.moveTo(pixelLastX, pixelLastY);
      this.ctx.lineTo(pixelX, pixelY);
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.size;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();

      if (this.onDraw) {
        this.onDraw(this.lastX, this.lastY, pos.x, pos.y, this.color, this.size);
      }

      this.lastX = pos.x;
      this.lastY = pos.y;
    };

    let onUp = () => {
      this.drawing = false;
    };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);

    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      onDown({ preventDefault: () => {}, clientX: touch.clientX, clientY: touch.clientY });
    }, {passive: false});

    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      onMove({ preventDefault: () => {}, clientX: touch.clientX, clientY: touch.clientY });
    }, {passive: false});

    c.addEventListener('touchend', onUp);
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.canvas.width,
      y: (e.clientY - rect.top) / this.canvas.height
    };
  }

  // --- Flood Fill ---

  hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    }
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
      255
    ];
  }

  colorsMatch(a, b, tolerance) {
    return Math.abs(a[0]-b[0]) <= tolerance &&
           Math.abs(a[1]-b[1]) <= tolerance &&
           Math.abs(a[2]-b[2]) <= tolerance &&
           Math.abs(a[3]-b[3]) <= tolerance;
  }

  floodFill(startX, startY, fillColor) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const imageData = this.ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const fillRgb = this.hexToRgb(fillColor);
    const tolerance = 32;

    const getPixel = (x, y) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i+1], data[i+2], data[i+3]];
    };

    const setPixel = (x, y) => {
      const i = (y * w + x) * 4;
      data[i] = fillRgb[0];
      data[i+1] = fillRgb[1];
      data[i+2] = fillRgb[2];
      data[i+3] = fillRgb[3];
    };

    if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;

    const targetColor = getPixel(startX, startY);

    // Don't fill if clicking on the same color
    if (this.colorsMatch(targetColor, fillRgb, 5)) return;

    // Scanline flood fill for performance
    const stack = [[startX, startY]];
    const visited = new Uint8Array(w * h);

    while (stack.length > 0) {
      const [x, y] = stack.pop();

      if (x < 0 || x >= w || y < 0 || y >= h) continue;

      const idx = y * w + x;
      if (visited[idx]) continue;

      const pixel = getPixel(x, y);
      if (!this.colorsMatch(pixel, targetColor, tolerance)) continue;

      // Scan left
      let lx = x;
      while (lx > 0 && !visited[(y * w + lx - 1)] && this.colorsMatch(getPixel(lx - 1, y), targetColor, tolerance)) {
        lx--;
      }

      // Scan right
      let rx = x;
      while (rx < w - 1 && !visited[(y * w + rx + 1)] && this.colorsMatch(getPixel(rx + 1, y), targetColor, tolerance)) {
        rx++;
      }

      // Fill the span and check above/below
      for (let i = lx; i <= rx; i++) {
        visited[y * w + i] = 1;
        setPixel(i, y);

        if (y > 0 && !visited[(y - 1) * w + i]) {
          stack.push([i, y - 1]);
        }
        if (y < h - 1 && !visited[(y + 1) * w + i]) {
          stack.push([i, y + 1]);
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  // --- Drawing ---

  clear() {
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  redraw() {
    if (this._history) {
      this.clear();
      for (const a of this._history) {
        this.applyAction(a);
      }
    } else {
      this.clear();
    }
  }

  setHistory(actions) {
    this._history = actions || [];
    this.redraw();
  }

  addAction(action) {
    if (!this._history) this._history = [];
    this._history.push(action);
    this.applyAction(action);
  }

  applyAction(a) {
    if (a.type === 'fill') {
      const pixelX = Math.floor(a.x * this.canvas.width);
      const pixelY = Math.floor(a.y * this.canvas.height);
      this.floodFill(pixelX, pixelY, a.color);
      return;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(a.prevX * this.canvas.width, a.prevY * this.canvas.height);
    this.ctx.lineTo(a.x * this.canvas.width, a.y * this.canvas.height);
    this.ctx.strokeStyle = a.color;
    this.ctx.lineWidth = a.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  clearHistory() {
    this._history = [];
    this.clear();
  }
}
