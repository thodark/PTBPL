document.addEventListener('DOMContentLoaded', function () {

  // ── Constants ────────────────────────────────────────────────
  const PHOTO_COUNTDOWN = 7;
  const MAX_PHOTOS      = 10;
  const MAX_SELECT      = 3;

  // High-DPI canvas — draw in logical 1080×1920 coords
  const dpr    = window.devicePixelRatio || 1;
  const CANVAS_W = 1080 * dpr;
  const CANVAS_H = 1920 * dpr;

  // Layout riêng cho từng Frame để không lẹm vào khung hình
  const FRAME_LAYOUTS = {
    'Film': [
      { x: 190, y: 220, w: 700, h: 440 }, // Bóp hẹp hai bên để né lỗ xỏ kim
      { x: 190, y: 700, w: 700, h: 440 },
      { x: 190, y: 1180, w: 700, h: 440 }
    ],
    'Cute': [
      { x: 140, y: 260, w: 800, h: 420 }, // Hạ thấp Y xuống để né cái nơ
      { x: 140, y: 720, w: 800, h: 420 },
      { x: 140, y: 1180, w: 800, h: 420 }
    ],
    'Fresh': [
      { x: 140, y: 220, w: 800, h: 440 },
      { x: 140, y: 700, w: 800, h: 440 },
      { x: 140, y: 1180, w: 800, h: 440 }
    ],
    'default': [
      { x: 140, y: 220, w: 800, h: 440 },
      { x: 140, y: 700, w: 800, h: 440 },
      { x: 140, y: 1180, w: 800, h: 440 }
    ]
  };

  const STICKER_COUNTS = { 'Cute': 7, 'Film': 9, 'Fresh': 8 };
  const STICKER_FOLDER = { 'Cute': 'Cute-Sticker', 'Film': 'Fim-Sticker', 'Fresh': 'Fresh-Sticker' };

  // ── Filter definitions ───────────────────────────────────────
  const FILTER_DEFS = {
    none:       { css: () => 'none', apply: () => {} },
    bw:         { css: (o) => `grayscale(${o}) contrast(${1 + 0.2*o})`,
                  apply: (ctx, w, h, o) => applyCSS(ctx, w, h, `grayscale(${o}) contrast(${1 + 0.2*o})`) },
    sepia:      { css: (o) => `sepia(${o}) contrast(${1 + 0.1*o}) brightness(${1 - 0.05*o})`,
                  apply: (ctx, w, h, o) => { applyCSS(ctx, w, h, `sepia(${o}) contrast(${1 + 0.1*o}) brightness(${1 - 0.05*o})`); addGrain(ctx, w, h, 18 * o); } },
    hicontrast: { css: (o) => `contrast(${1 + 0.8*o}) brightness(${1 - 0.1*o}) saturate(${1 + 0.3*o})`,
                  apply: (ctx, w, h, o) => applyCSS(ctx, w, h, `contrast(${1 + 0.8*o}) brightness(${1 - 0.1*o}) saturate(${1 + 0.3*o})`) },
    grain:      { css: (o) => `contrast(1.05) brightness(${1 - 0.05*o}) saturate(${1 - 0.15*o})`,
                  apply: (ctx, w, h, o) => { applyCSS(ctx, w, h, `contrast(1.05) brightness(${1 - 0.05*o}) saturate(${1 - 0.15*o})`); addGrain(ctx, w, h, 40 * o); } },
    rosy:       { css: (o) => `saturate(${1 + 0.3*o}) brightness(${1 + 0.08*o}) hue-rotate(${-10*o}deg)`,
                  apply: (ctx, w, h, o) => { applyCSS(ctx, w, h, `saturate(${1 + 0.3*o}) brightness(${1 + 0.08*o}) hue-rotate(${-10*o}deg)`); addColorTint(ctx, w, h, 255, 150, 160, 0.08 * o); } },
    warm:       { css: (o) => `saturate(${1 + 0.2*o}) brightness(${1 + 0.08*o}) sepia(${0.2*o})`,
                  apply: (ctx, w, h, o) => { applyCSS(ctx, w, h, `saturate(${1 + 0.2*o}) brightness(${1 + 0.08*o}) sepia(${0.2*o})`); addColorTint(ctx, w, h, 255, 200, 120, 0.06 * o); } }
  };

  function applyCSS(ctx, w, h, filterStr) {
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d'); tCtx.filter = filterStr; tCtx.drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.drawImage(tmp, 0, 0);
  }
  function addGrain(ctx, w, h, intensity) {
    if (intensity <= 0) return;
    const imgData = ctx.getImageData(0, 0, w, h); const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * intensity * 2;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  }
  function addColorTint(ctx, w, h, r, g, b, alpha) {
    if (alpha <= 0) return; ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`; ctx.fillRect(0, 0, w, h);
  }

  // ── State ────────────────────────────────────────────────────
  let photos           = [];
  let selectedPhotos   = [];
  let isSessionActive  = false;
  let currentFilterKey = 'none';
  let filterOpacity    = 1.0;
  let currentConcept   = null;
  let frameImage       = null;
  let stickers         = [];
  let activeSticker    = null;
  let dragState        = null;
  let photoCount       = 0;

  // ── DOM ──────────────────────────────────────────────────────
  const video             = document.getElementById('video');
  const captureCanvas     = document.getElementById('canvas');
  const captureCtx        = captureCanvas.getContext('2d');
  const startButton       = document.getElementById('startButton');
  const restartButton     = document.getElementById('restartButton');
  const countdownDisplay  = document.getElementById('countdownDisplay');
  const flash             = document.getElementById('flash');
  const progressBar       = document.getElementById('progressBar');
  const cameraHint        = document.getElementById('cameraHint');
  const photoCountDisplay = document.getElementById('photoCountDisplay');
  const timerDisplay      = document.getElementById('timerDisplay');
  const filterButtons     = document.querySelectorAll('.filter-btn');
  const opacitySlider     = document.getElementById('opacitySlider');
  const opacityValue      = document.getElementById('opacityValue');
  const opacityRow        = document.getElementById('opacityRow');
  const cameraSection     = document.getElementById('cameraSection');
  const selectionSection  = document.getElementById('selectionSection');
  const editorSection     = document.getElementById('editorSection');
  const selectionGrid     = document.getElementById('selectionGrid');
  const selectionCounter  = document.getElementById('selectionCounter');
  const nextToEditorBtn   = document.getElementById('nextToEditorBtn');
  const backToCameraBtn   = document.getElementById('backToCameraBtn');
  const editorCanvas      = document.getElementById('editorCanvas');
  const editorCtx         = editorCanvas.getContext('2d');
  const framePickerBtns   = document.querySelectorAll('.frame-pick-btn');
  const stickerPanel      = document.getElementById('stickerPanel');
  const stickerGrid       = document.getElementById('stickerGrid');
  const exportBtn         = document.getElementById('exportBtn');
  const backToSelectBtn   = document.getElementById('backToSelectBtn');
  const goToSelectionBtn  = document.getElementById('goToSelectionBtn');

  // Copy Bank Button
  const copyBankBtn       = document.getElementById('copyBankBtn');
  if (copyBankBtn) {
    copyBankBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('0941852065').then(() => {
        showNotification('Đã copy số tài khoản! Cảm ơn bạn nhiều nha 💕');
      });
    });
  }

  // ── Setup high-DPI editor canvas ─────────────────────────────
  editorCanvas.width        = CANVAS_W;
  editorCanvas.height       = CANVAS_H;
  editorCanvas.style.width  = '540px';
  editorCanvas.style.height = '960px';
  editorCtx.scale(dpr, dpr);   // now draw in logical 1080×1920
  editorCtx.imageSmoothingEnabled = true;
  editorCtx.imageSmoothingQuality = "high";

  // ── Camera (4:3 High Res) ────────────────────────────────────
  let currentStream = null;

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Trình duyệt không hỗ trợ Camera (hoặc bạn đang không mở qua https/localhost).'); return;
    }
    if (location.protocol === 'file:') {
      if (cameraHint) cameraHint.textContent = '⚠️ Mở qua Local Server để dùng camera nhé';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          aspectRatio: 4/3,
          width: { ideal: 1920 }, 
          height: { ideal: 1440 },
          facingMode: "user" 
        }, 
        audio: false
      });
      currentStream = stream;
      video.srcObject = stream;
      video.play().catch(() => {});
      if (cameraHint) cameraHint.style.display = 'none';
    } catch (err) {
      console.error("Lỗi camera chi tiết:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('❌ Trình duyệt đang chặn Camera. Hãy ấn vào biểu tượng ổ khóa trên thanh địa chỉ để cấp quyền lại nhé.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showError('❌ Không tìm thấy Webcam/Camera nào được kết nối với máy.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        showError('❌ Camera đang bị ứng dụng khác (Zoom, Meet, OBS...) sử dụng. Hãy tắt chúng và F5 lại trang.');
      } else {
        showError('❌ Không thể mở Camera: ' + err.message);
      }
    }
  }

  function startSession() {
    if (isSessionActive) return;
    isSessionActive = true;
    startButton.classList.add('hidden');
    restartButton.classList.remove('hidden');
    goToSelectionBtn.classList.add('hidden');
    if (cameraHint) cameraHint.style.display = 'none';
    startPhotoCountdown();
  }

  function restartSession() {
    if (!confirm('Bạn có chắc muốn xóa hết ảnh và chụp lại từ đầu không?')) return;
    isSessionActive = false;
    photos = []; photoCount = 0;
    photoCountDisplay.textContent = '0';
    progressBar.style.width = '0%';
    timerDisplay.textContent = PHOTO_COUNTDOWN;
    startButton.classList.remove('hidden');
    restartButton.classList.add('hidden');
    goToSelectionBtn.classList.add('hidden');
    renderCameraGallery();
  }

  function endSession() {
    isSessionActive = false;
    timerDisplay.textContent = 'Xong!';
    restartButton.classList.add('hidden');
    goToSelectionBtn.classList.remove('hidden');
    showNotification('Đã chụp xong! Hãy chọn tối đa 3 ảnh nhé ✨');
  }

  function startPhotoCountdown() {
    if (!isSessionActive) return;
    let countdown = PHOTO_COUNTDOWN;
    const interval = setInterval(() => {
      if (!isSessionActive) { clearInterval(interval); return; }
      countdownDisplay.textContent = countdown;
      timerDisplay.textContent = countdown;
      countdownDisplay.classList.remove('pop');
      void countdownDisplay.offsetWidth;
      countdownDisplay.classList.add('pop');
      setTimeout(() => countdownDisplay.classList.remove('pop'), 950);
      countdown--;
      if (countdown < 0) {
        clearInterval(interval);
        takePhoto();
        if (photoCount < MAX_PHOTOS && isSessionActive) startPhotoCountdown();
        else if (photoCount >= MAX_PHOTOS) endSession();
      }
    }, 1000);
  }

  function takePhoto() {
    photoCount++;
    photoCountDisplay.textContent = photoCount;
    progressBar.style.width = (photoCount / MAX_PHOTOS * 100) + '%';
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 300);

    const captureWidth = 1920;
    const captureHeight = 1440;
    captureCanvas.width  = captureWidth;
    captureCanvas.height = captureHeight;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetRatio = 4 / 3;
    let sourceWidth = vw;
    let sourceHeight = vh;
    let sourceX = 0;
    let sourceY = 0;

    if (vw / vh > targetRatio) {
      sourceWidth = vh * targetRatio;
      sourceX = (vw - sourceWidth) / 2;
    } else {
      sourceHeight = vw / targetRatio;
      sourceY = (vh - sourceHeight) / 2;
    }

    captureCtx.save();
    captureCtx.translate(captureWidth, 0);
    captureCtx.scale(-1, 1);
    captureCtx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, captureWidth, captureHeight);
    captureCtx.restore();

    const def = FILTER_DEFS[currentFilterKey];
    if (def && currentFilterKey !== 'none') def.apply(captureCtx, captureWidth, captureHeight, filterOpacity);

    const dataURL = captureCanvas.toDataURL('image/jpeg', 0.95);
    const img = new Image();
    img.src = dataURL;
    photos.push({ dataURL, img });
    renderCameraGallery();
  }

  function renderCameraGallery() {
    const gallery = document.getElementById('cameraGallery');
    gallery.innerHTML = '';
    photos.forEach((p, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'cam-thumb';
      thumb.innerHTML = `<img src="${p.dataURL}" alt="Ảnh ${i+1}"><span class="thumb-num">#${i+1}</span>`;
      gallery.appendChild(thumb);
    });
  }

  function showSection(name) {
    cameraSection.classList.toggle('hidden', name !== 'camera');
    selectionSection.classList.toggle('hidden', name !== 'selection');
    editorSection.classList.toggle('hidden', name !== 'editor');
  }

  goToSelectionBtn.addEventListener('click', () => {
    if (photos.length === 0) { showNotification('Phải chụp ảnh trước đã chứ! 📸'); return; }
    selectedPhotos = [];
    renderSelectionGrid();
    showSection('selection');
  });
  backToCameraBtn.addEventListener('click', () => showSection('camera'));
  nextToEditorBtn.addEventListener('click', () => {
    if (selectedPhotos.length === 0) { showNotification('Hãy chọn ít nhất 1 bức ảnh! 🎯'); return; }
    stickers = []; activeSticker = null; currentConcept = null; frameImage = null;
    initEditor();
    showSection('editor');
  });
  backToSelectBtn.addEventListener('click', () => showSection('selection'));

  function renderSelectionGrid() {
    selectionGrid.innerHTML = '';
    photos.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'sel-card' + (selectedPhotos.includes(i) ? ' selected' : '');
      card.innerHTML = `
        <img src="${p.dataURL}" alt="Ảnh ${i+1}">
        <div class="sel-overlay"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <span class="sel-num">#${i+1}</span>`;
      card.addEventListener('click', () => {
        const pos = selectedPhotos.indexOf(i);
        if (pos > -1) { selectedPhotos.splice(pos, 1); }
        else {
          if (selectedPhotos.length >= MAX_SELECT) { showNotification(`Chỉ được chọn tối đa ${MAX_SELECT} ảnh thôi! 🎯`); return; }
          selectedPhotos.push(i);
        }
        renderSelectionGrid();
      });
      selectionGrid.appendChild(card);
    });
    const n = selectedPhotos.length;
    selectionCounter.textContent = `Đã chọn ${n} / ${MAX_SELECT}`;
    nextToEditorBtn.disabled = n === 0;
  }

  function canvasPoint(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const sx = 1080 / rect.width;
    const sy = 1920 / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  function drawFrameBackground(ctx, img) {
    const shrink = 2;
    ctx.drawImage(img, shrink, shrink, 1080 - shrink * 2, 1920 - shrink * 2);
  }

  function drawRoundedImage(ctx, img, x, y, w, h, radius = 20, borderColor = null) {
    if (!img.complete || !img.width) return;
    
    const createRoundedPath = (c) => {
      c.beginPath();
      c.moveTo(x + radius, y);
      c.lineTo(x + w - radius, y);
      c.quadraticCurveTo(x + w, y, x + w, y + radius);
      c.lineTo(x + w, y + h - radius);
      c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      c.lineTo(x + radius, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - radius);
      c.lineTo(x, y + radius);
      c.quadraticCurveTo(x, y, x + radius, y);
      c.closePath();
    };

    ctx.save();
    createRoundedPath(ctx);
    ctx.clip(); 

    const scale = Math.max(w / img.width, h / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;

    const offsetX = (w - drawWidth) / 2;
    const offsetY = (h - drawHeight) / 2; 

    ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
    ctx.restore();

    if (borderColor) {
      ctx.save();
      ctx.lineWidth = 10;
      ctx.strokeStyle = borderColor;
      createRoundedPath(ctx);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSticker(ctx, s) {
    if (!s.img.complete || !s.img.width) return;
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
    ctx.rotate(s.rotation || 0);
    ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  function renderEditor() {
    editorCtx.clearRect(0, 0, 1080, 1920);

    editorCtx.fillStyle = '#fff'; 
    editorCtx.fillRect(0, 0, 1080, 1920);

    if (frameImage) drawFrameBackground(editorCtx, frameImage);

    const activeLayout = FRAME_LAYOUTS[currentConcept] || FRAME_LAYOUTS['default'];
    
    const CONCEPT_COLORS = {
      'Cute': '#ff7eb3',
      'Film': '#ffffff',
      'Fresh': '#8ec5ff'
    };
    const currentBorderColor = CONCEPT_COLORS[currentConcept] || null;

    selectedPhotos.forEach((photoIdx, slotIdx) => {
      if (slotIdx >= activeLayout.length) return;
      const photo = photos[photoIdx]; if (!photo) return;
      drawRoundedImage(
        editorCtx, 
        photo.img, 
        activeLayout[slotIdx].x, 
        activeLayout[slotIdx].y, 
        activeLayout[slotIdx].w, 
        activeLayout[slotIdx].h, 
        20,
        currentBorderColor
      );
    });

    stickers.forEach(s => drawSticker(editorCtx, s));

    const active = stickers.find(s => s.id === activeSticker);
    if (active) drawHandles(active);
  }

  const HANDLE_SIZE = 14;

  function drawHandles(s) {
    editorCtx.save();
    editorCtx.translate(s.x + s.w / 2, s.y + s.h / 2);
    editorCtx.rotate(s.rotation || 0);
    const hx = -s.w / 2, hy = -s.h / 2;
    editorCtx.strokeStyle = '#b066ff'; 
    editorCtx.lineWidth = 2;
    editorCtx.setLineDash([6, 3]);
    editorCtx.strokeRect(hx, hy, s.w, s.h);
    editorCtx.setLineDash([]);
    [{ x: hx, y: hy }, { x: hx + s.w, y: hy }, { x: hx, y: hy + s.h }, { x: hx + s.w, y: hy + s.h }].forEach(c => {
      editorCtx.fillStyle = '#000';
      editorCtx.strokeStyle = '#ff7eb3';
      editorCtx.lineWidth = 2;
      editorCtx.fillRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      editorCtx.strokeRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    });
    editorCtx.restore();
  }

  function hitSticker(s, pt) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const cos = Math.cos(-(s.rotation || 0)), sin = Math.sin(-(s.rotation || 0));
    const dx = pt.x - cx, dy = pt.y - cy;
    const lx = cos * dx - sin * dy, ly = sin * dx + cos * dy;
    return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
  }

  function hitCorner(s, pt) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const cos = Math.cos(-(s.rotation || 0)), sin = Math.sin(-(s.rotation || 0));
    const dx = pt.x - cx, dy = pt.y - cy;
    const lx = cos * dx - sin * dy, ly = sin * dx + cos * dy;
    const t = HANDLE_SIZE;
    for (const c of [{ lx: -s.w/2, ly: -s.h/2, corner: 'tl' }, { lx: s.w/2, ly: -s.h/2, corner: 'tr' }, { lx: -s.w/2, ly: s.h/2, corner: 'bl' }, { lx: s.w/2, ly: s.h/2, corner: 'br' }]) {
      if (Math.abs(lx - c.lx) < t && Math.abs(ly - c.ly) < t) return c.corner;
    }
    return null;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const pt = canvasPoint(e);
    const active = stickers.find(s => s.id === activeSticker);

    if (active) {
      const corner = hitCorner(active, pt);
      if (corner) {
        dragState = { type: 'resize', id: active.id, corner, startX: pt.x, startY: pt.y,
          origX: active.x, origY: active.y, origW: active.w, origH: active.h, ratio: active.w / active.h };
        return;
      }
    }

    for (let i = stickers.length - 1; i >= 0; i--) {
      if (hitSticker(stickers[i], pt)) {
        activeSticker = stickers[i].id;
        dragState = { type: 'move', id: stickers[i].id, startX: pt.x, startY: pt.y, origX: stickers[i].x, origY: stickers[i].y };
        renderEditor(); return;
      }
    }
    activeSticker = null; dragState = null; renderEditor();
  }

  function onPointerMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const pt = canvasPoint(e);
    const dx = pt.x - dragState.startX, dy = pt.y - dragState.startY;
    const s = stickers.find(st => st.id === dragState.id);
    if (!s) return;
    if (dragState.type === 'move') {
      s.x = Math.max(0, Math.min(1080 - s.w, dragState.origX + dx));
      s.y = Math.max(0, Math.min(1920 - s.h, dragState.origY + dy));
    } else {
      const { corner, origX, origY, origW, origH, ratio } = dragState;
      let newW = origW;
      if (corner === 'br') { newW = Math.max(40, origW + dx); }
      else if (corner === 'bl') { newW = Math.max(40, origW - dx); s.x = origX + origW - newW; }
      else if (corner === 'tr') { newW = Math.max(40, origW + dx); }
      else if (corner === 'tl') { newW = Math.max(40, origW - dx); s.x = origX + origW - newW; }
      const newH = newW / ratio;
      if (corner === 'tr' || corner === 'tl') s.y = origY + origH - newH;
      s.w = Math.round(newW); s.h = Math.round(newH);
    }
    renderEditor();
  }

  function onPointerUp() { dragState = null; }

  editorCanvas.addEventListener('mousedown',  onPointerDown, { passive: false });
  editorCanvas.addEventListener('mousemove',  onPointerMove, { passive: false });
  editorCanvas.addEventListener('mouseup',    onPointerUp);
  editorCanvas.addEventListener('mouseleave', onPointerUp);
  editorCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
  editorCanvas.addEventListener('touchmove',  onPointerMove, { passive: false });
  editorCanvas.addEventListener('touchend',   onPointerUp);

  editorCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!activeSticker) return;
    const s = stickers.find(st => st.id === activeSticker);
    if (!s) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (e.shiftKey) {
      const factor = 1 + dir * 0.05;
      s.w = Math.max(40, Math.round(s.w * factor));
      s.h = Math.max(40, Math.round(s.h * factor));
    } else {
      s.rotation = (s.rotation || 0) + dir * 0.08;
    }
    renderEditor();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeSticker && !editorSection.classList.contains('hidden')) {
      stickers = stickers.filter(s => s.id !== activeSticker);
      activeSticker = null; renderEditor();
    }
  });

  function initEditor() {
    renderEditor();
    framePickerBtns.forEach(b => b.classList.remove('active'));
    stickerPanel.style.display = 'none';
    stickerGrid.innerHTML = '';
  }

  framePickerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const concept = btn.dataset.concept;
      if (currentConcept === concept) {
        currentConcept = null; frameImage = null;
        btn.classList.remove('active');
        stickerPanel.style.display = 'none';
        renderEditor();
      } else {
        currentConcept = concept;
        framePickerBtns.forEach(b => b.classList.toggle('active', b.dataset.concept === concept));
        loadFrame(concept);
        loadStickerGrid(concept);
      }
    });
  });

  function loadFrame(concept) {
    const img = new Image();
    img.onload = () => { frameImage = img; renderEditor(); };
    img.onerror = () => { frameImage = null; renderEditor(); };
    img.src = `assets/Frame/${concept}/Frame-${concept}.png`;
  }

  function loadStickerGrid(concept) {
    stickerGrid.innerHTML = '';
    stickerPanel.style.display = concept ? 'block' : 'none';
    if (!concept) return;
    const folder = STICKER_FOLDER[concept];
    const count  = STICKER_COUNTS[concept] || 5;
    for (let i = 1; i <= count; i++) {
      const src = `assets/Sticker/${folder}/${i}.png`;
      const btn = document.createElement('div');
      btn.className = 'sticker-btn';
      const img = document.createElement('img');
      img.src = src;
      img.onerror = () => { btn.style.display = 'none'; };
      btn.appendChild(img);
      btn.addEventListener('click', () => addSticker(src));
      stickerGrid.appendChild(btn);
    }
  }

  function addSticker(src) {
    const img = new Image();
    img.onload = () => {
      const size = Math.round(1080 * 0.2);
      const h = Math.round(size * (img.naturalHeight / img.naturalWidth));
      stickers.push({ img, src, x: (1080 - size) / 2, y: (1920 - h) / 2, w: size, h, rotation: 0, id: Date.now() + Math.random() });
      activeSticker = stickers[stickers.length - 1].id;
      renderEditor();
    };
    img.src = src;
  }

  exportBtn.addEventListener('click', () => {
    activeSticker = null; 
    renderEditor();
    const a = document.createElement('a');
    a.href = editorCanvas.toDataURL('image/png', 1.0); 
    a.download = `photobooth_${currentConcept || 'custom'}_${Date.now()}.png`;
    a.click();
    showNotification('Đã tải ảnh về máy! 🎉');
  });

  function showNotification(msg) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#b066ff,#ff7eb3);color:#fff;padding:12px 28px;border-radius:50px;box-shadow:0 0 20px rgba(176,102,255,0.6);z-index:99999;font-family:Poppins,sans-serif;font-weight:600;animation:nbIn 0.4s ease;white-space:nowrap;';
    n.textContent = msg; document.body.appendChild(n);
    setTimeout(() => { n.style.animation = 'nbOut 0.4s ease forwards'; setTimeout(() => n.remove(), 400); }, 2500);
  }
  function showError(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'background:rgba(255,50,50,0.15);border:1px solid rgba(255,50,50,0.3);backdrop-filter:blur(10px);border-radius:12px;padding:16px 20px;margin:12px 0;font-family:Poppins,sans-serif;font-size:14px;color:#ff8eb3;box-shadow:0 0 10px rgba(255,50,50,0.2);';
    d.textContent = msg; document.body.prepend(d);
  }
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes nbIn{from{opacity:0;transform:translate(-50%,-16px)}to{opacity:1;transform:translate(-50%,0)}} @keyframes nbOut{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-16px)}}';
  document.head.appendChild(styleEl);

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterKey = btn.dataset.filter;
      const def = FILTER_DEFS[currentFilterKey];
      video.style.filter = (def && currentFilterKey !== 'none') ? def.css(filterOpacity) : 'none';
      if (opacityRow) opacityRow.style.display = currentFilterKey === 'none' ? 'none' : 'flex';
    });
  });
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      filterOpacity = opacitySlider.value / 100;
      if (opacityValue) opacityValue.textContent = opacitySlider.value + '%';
      const def = FILTER_DEFS[currentFilterKey];
      video.style.filter = (def && currentFilterKey !== 'none') ? def.css(filterOpacity) : 'none';
    });
  }

  startButton.addEventListener('click', startSession);
  restartButton.addEventListener('click', restartSession);

  showSection('camera');
  startCamera();
});