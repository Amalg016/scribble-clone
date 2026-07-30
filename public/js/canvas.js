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
    this.canvas.style.cursor = 'crosshair';
  }

  disable() {
    this.enabled = false;
    this.onDraw = null;
    this.onClear = null;
    this.drawing = false;
    this.canvas.style.cursor = 'default';
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
