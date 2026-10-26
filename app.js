const $ = (id) => document.getElementById(id);
const els = {
  video: $('cameraVideo'), canvas: $('hudCanvas'), stage: $('cameraStage'),
  cameraBtn: $('cameraBtn'), aiBtn: $('aiBtn'), roadBtn: $('roadBtn'),
  switchBtn: $('switchCameraBtn'), gridBtn: $('gridBtn'), hudBtn: $('hudBtn'),
  captureBtn: $('captureBtn'), torchBtn: $('torchBtn'), stopBtn: $('stopBtn'),
  speakBtn: $('speakBtn'), voiceCommandBtn: $('voiceCommandBtn'), testVoiceBtn: $('testVoiceBtn'),
  cameraState: $('cameraState'), cameraInfo: $('cameraInfo'), cameraLed: $('cameraLed'),
  systemState: $('systemState'), fpsValue: $('fpsValue'), clockValue: $('clockValue'),
  objectCount: $('objectCount'), roadState: $('roadState'), inferenceTime: $('inferenceTime'),
  hint: $('hintChip'), enginePill: $('enginePill'), aiSub: $('aiButtonSub'), roadSub: $('roadButtonSub'),
  voiceState: $('voiceState'), log: $('consoleLog'), logCount: $('logCount'), toast: $('toastRegion'),
  installBtn: $('installBtn'), settingsBtn: $('settingsBtn'), settingsDialog: $('settingsDialog'),
  confidenceRange: $('confidenceRange'), confidenceOutput: $('confidenceOutput'), detRate: $('detRate'),
  voiceSelect: $('voiceSelect'), speechLang: $('speechLang')
};

const CONFIG = {
  visionVersion: '0.10.22',
  objectModelUrl: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
  roadModel: 'Xenova/segformer-b0-finetuned-ade-512-512',
  transformersUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1',
  modelCacheName: 'jarvis-model-binaries-v2',
  objectDefaultConfidence: 0.45,
  maxObjects: 8,
  minRoadInterval: 1800,
  roadInferenceSize: 384
};

const state = {
  stream: null,
  facingMode: 'environment',
  detector: null,
  segmenter: null,
  aiLoading: false,
  roadLoading: false,
  aiOn: false,
  roadOn: false,
  gridOn: true,
  hudOn: true,
  torchOn: false,
  torchSupported: false,
  detectionResults: [],
  roadMaskCanvas: null,
  roadMaskFound: false,
  lastRoadInference: 0,
  lastDetectionInference: 0,
  lastVideoTime: -1,
  lastDetectionsForFps: 0,
  detectionsThisSecond: 0,
  inferenceMs: 0,
  confidence: CONFIG.objectDefaultConfidence,
  detectionInterval: Number(els.detRate.value || 400),
  raf: 0,
  visionModulePromise: null,
  transformersModulePromise: null,
  cameraStarting: false,
  tracks: [],
  nextTrackId: 1,
  deferredInstall: null,
  voiceList: [],
  selectedVoiceURI: '',
  recognition: null,
  listening: false,
  lastCommand: '',
  lastToast: '',
  toastTimer: 0,
  contextLost: false
};

function log(message, level = 'info') {
  const p = document.createElement('p');
  p.className = level;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const span = document.createElement('span');
  span.textContent = message;
  p.append(time, span);
  els.log.prepend(p);
  while (els.log.children.length > 30) els.log.lastElementChild.remove();
  els.logCount.textContent = `${els.log.children.length} EVENTS`;
  if (level === 'error') setSystemState('ERROR');
}

function toast(message, type = '') {
  if (state.lastToast === message) return;
  state.lastToast = message;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  els.toast.replaceChildren(node);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    els.toast.replaceChildren();
    state.lastToast = '';
  }, 3200);
}

function setSystemState(value) {
  els.systemState.textContent = value.toUpperCase();
  const running = ['CAMERA LIVE', 'AI ACTIVE', 'SCANNING'].includes(value.toUpperCase());
  els.enginePill.classList.toggle('running', running);
  els.enginePill.innerHTML = `<i></i> ${running ? 'SYSTEM ACTIVE' : (value.toUpperCase() === 'ERROR' ? 'CHECK CONSOLE' : 'ENGINE IDLE')}`;
}

function setCameraStatus(active, text, info = '') {
  els.cameraState.textContent = text;
  els.cameraInfo.textContent = info;
  els.cameraLed.classList.toggle('on', active);
  els.cameraBtn.querySelector('b').textContent = active ? 'Stop camera' : 'Start camera';
  els.cameraBtn.querySelector('small').textContent = active ? 'Disable live view' : 'Enable live view';
  if (!active) {
    els.objectCount.textContent = '0';
    els.fpsValue.textContent = '0';
  }
}

function buttonState(button, active) {
  button.classList.toggle('active', active);
  const em = button.querySelector('em');
  if (em) em.textContent = active ? 'ON' : 'OFF';
}

function isSecureCameraContext() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

async function startCamera() {
  if (state.cameraStarting) return;
  if (state.stream) { await stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia) {
    log('This browser does not expose camera access. Open the HTTPS site in Chrome.', 'error');
    toast('Camera API unavailable. Open the HTTPS site in Chrome.', 'error');
    return;
  }
  if (!isSecureCameraContext()) {
    log('Camera requires HTTPS or localhost. GitHub Pages provides HTTPS.', 'error');
    toast('Open the HTTPS website. A local file cannot use the camera.', 'error');
    return;
  }
  state.cameraStarting = true;
  els.cameraBtn.disabled = true;
  setSystemState('STARTING CAMERA');
  setCameraStatus(false, 'REQUESTING CAMERA', 'Waiting for permission…');
  try {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }
      }
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (firstError) {
      if (firstError.name === 'OverconstrainedError' || firstError.name === 'NotFoundError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } else throw firstError;
    }
    state.stream = stream;
    els.video.srcObject = stream;
    await els.video.play();
    await new Promise(resolve => {
      if (els.video.videoWidth > 0) return resolve();
      const done = () => { els.video.removeEventListener('loadedmetadata', done); resolve(); };
      els.video.addEventListener('loadedmetadata', done, { once: true });
      setTimeout(done, 2500);
    });
    if (!els.video.videoWidth || !els.video.videoHeight) throw new Error('Camera started but no video frames arrived. Close other camera apps and retry.');
    resizeCanvas();
    state.roadMaskCanvas = null;
    state.lastVideoTime = -1;
    const track = state.stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    state.torchSupported = Boolean(track.getCapabilities && track.getCapabilities().torch);
    els.torchBtn.disabled = !state.torchSupported;
    els.cameraInfo.textContent = `${settings.width || els.video.videoWidth}×${settings.height || els.video.videoHeight} · ${state.facingMode === 'environment' ? 'REAR' : 'FRONT'}`;
    setCameraStatus(true, 'CAMERA LIVE', 'Video stream connected');
    setSystemState(state.aiOn ? 'AI ACTIVE' : 'CAMERA LIVE');
    els.hint.textContent = 'LIVE FEED · MODELS RUN ON THIS DEVICE';
    log('Camera connected. Video processing is local to this device.', 'success');
    toast('Camera online. AI engines can now be enabled.');
    if (!state.raf) state.raf = requestAnimationFrame(renderLoop);
  } catch (error) {
    state.stream = null;
    els.video.srcObject = null;
    const message = explainCameraError(error);
    setCameraStatus(false, 'CAMERA UNAVAILABLE', message);
    setSystemState('ERROR');
    log(message, 'error');
    toast(message, 'error');
  } finally {
    state.cameraStarting = false;
    els.cameraBtn.disabled = false;
  }
}

function explainCameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Camera permission denied. Allow camera access in Chrome site settings and retry.';
  if (error?.name === 'NotFoundError') return 'No camera was found on this device.';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'Camera is busy or unavailable. Close other apps using the camera and retry.';
  if (error?.name === 'SecurityError') return 'Browser security blocked camera access. Open the HTTPS site in Chrome.';
  return error?.message || 'Camera startup failed. Check permission and retry.';
}

async function stopCamera() {
  state.aiOn = false;
  state.roadOn = false;
  state.detectionResults = [];
  state.roadMaskCanvas = null;
  state.roadMaskFound = false;
  state.torchOn = false;
  if (state.stream) {
    try { state.stream.getTracks().forEach(track => track.stop()); } catch (_) {}
  }
  state.stream = null;
  els.video.pause();
  els.video.srcObject = null;
  state.roadMaskCanvas = null;
  els.canvas.getContext('2d')?.clearRect(0, 0, els.canvas.width, els.canvas.height);
  setCameraStatus(false, 'CAMERA STANDBY', 'Camera stopped');
  els.aiBtn.querySelector('small').textContent = state.detector ? 'Loaded · OFF' : 'Not loaded';
  els.roadBtn.querySelector('small').textContent = state.segmenter ? 'Loaded · OFF' : 'Not loaded';
  els.roadState.textContent = 'OFFLINE';
  els.objectCount.textContent = '0';
  els.torchBtn.disabled = true;
  buttonState(els.gridBtn, state.gridOn);
  if (!state.raf) state.raf = requestAnimationFrame(renderLoop);
  setSystemState(state.detector || state.segmenter ? 'ENGINES READY' : 'READY');
  log('Camera and active inference loops stopped. Loaded models are retained for this page session.', 'info');
}

async function switchCamera() {
  const wasActive = Boolean(state.stream);
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  if (wasActive) {
    // Stop the old stream without toggling out the user's AI preferences.
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    els.video.srcObject = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      state.stream = stream;
      state.roadMaskCanvas = null;
      state.roadMaskFound = false;
      state.lastRoadInference = 0;
      state.lastDetectionInference = 0;
      els.video.srcObject = stream;
      await els.video.play();
      resizeCanvas();
      state.torchOn = false;
      const track = stream.getVideoTracks()[0];
      state.torchSupported = Boolean(track.getCapabilities && track.getCapabilities().torch);
      els.torchBtn.disabled = !state.torchSupported;
      const settings = track.getSettings ? track.getSettings() : {};
      els.cameraInfo.textContent = `${settings.width || els.video.videoWidth}×${settings.height || els.video.videoHeight} · ${state.facingMode === 'environment' ? 'REAR' : 'FRONT'}`;
      log(`Switched to ${state.facingMode === 'environment' ? 'rear' : 'front'} camera.`, 'success');
    } catch (error) {
      log(`Camera switch failed: ${explainCameraError(error)}`, 'error');
      toast('Camera switch failed. Attempting to restore the rear camera.', 'error');
      state.facingMode = 'environment';
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        els.video.srcObject = state.stream;
        await els.video.play();
        resizeCanvas();
      } catch (restoreError) { await stopCamera(); }
    }
  } else {
    log(`Camera preference set to ${state.facingMode === 'environment' ? 'rear' : 'front'}.`, 'info');
    toast(`Next camera: ${state.facingMode === 'environment' ? 'rear' : 'front'}`);
  }
}

function resizeCanvas() {
  if (!els.video.videoWidth || !els.video.videoHeight) return;
  const w = els.video.videoWidth;
  const h = els.video.videoHeight;
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
  }
}

async function cachedModelBytes(url, label) {
  let cache = null;
  try { if ('caches' in window) cache = await caches.open(CONFIG.modelCacheName); }
  catch (error) { log(`Browser model cache unavailable; attempting direct download (${error.message}).`, 'info'); }
  if (cache) {
    try {
      const cached = await cache.match(url);
      if (cached) {
        const buffer = await cached.arrayBuffer();
        log(`${label} binary restored from browser cache (${(buffer.byteLength / 1048576).toFixed(1)} MB).`, 'success');
        return new Uint8Array(buffer);
      }
    } catch (error) { log(`Cache read skipped for ${label}: ${error.message}`, 'info'); }
  }
  const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  if (!response.ok) throw new Error(`${label} download failed (HTTP ${response.status}). Check internet access and retry.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error(`${label} download returned an empty file.`);
  if (cache) {
    try { await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); }
    catch (error) { log(`Model caching unavailable; model can still run this session (${error.message}).`, 'info'); }
  }
  return bytes;
}

async function loadObjectDetector() {
  if (state.detector) return state.detector;
  if (state.aiLoading) throw new Error('Object AI is already loading.');
  state.aiLoading = true;
  els.aiBtn.disabled = true;
  els.aiBtn.querySelector('small').textContent = 'Loading engine…';
  els.hint.textContent = 'DOWNLOADING OBJECT AI MODEL';
  setSystemState('LOADING OBJECT AI');
  log('Loading MediaPipe vision runtime and EfficientDet Lite0 object model…', 'info');
  try {
    if (!isSecureCameraContext()) throw new Error('AI camera features require the HTTPS website.');
    if (!state.visionModulePromise) state.visionModulePromise = import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CONFIG.visionVersion}/vision_bundle.mjs`);
    const vision = await state.visionModulePromise;
    const bytes = await cachedModelBytes(CONFIG.objectModelUrl, 'Object detector');
    const resolver = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CONFIG.visionVersion}/wasm`);
    state.detector = await vision.ObjectDetector.createFromOptions(resolver, {
      baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
      runningMode: 'VIDEO',
      scoreThreshold: state.confidence,
      maxResults: CONFIG.maxObjects,
      displayNamesLocale: 'en'
    });
    els.aiBtn.classList.add('loaded');
    els.aiBtn.querySelector('small').textContent = 'Model ready · OFF';
    log('Object AI loaded successfully. It will run on this phone when enabled.', 'success');
    return state.detector;
  } catch (error) {
    state.detector = null;
    els.aiBtn.querySelector('small').textContent = 'Load failed · Retry';
    const message = error?.message || 'Object AI could not be loaded.';
    log(`Object AI load failed: ${message}`, 'error');
    toast(message, 'error');
    throw error;
  } finally {
    state.aiLoading = false;
    els.aiBtn.disabled = false;
    if (!state.aiOn) setSystemState(state.stream ? 'CAMERA LIVE' : 'READY');
  }
}

async function toggleObjectAI(forceValue) {
  const desired = typeof forceValue === 'boolean' ? forceValue : !state.aiOn;
  if (desired === state.aiOn) return;
  if (desired && !state.stream) {
    toast('Start the camera before enabling object AI.', 'error');
    log('Object AI not started: camera is off.', 'error');
    return;
  }
  if (desired) {
    try {
      await loadObjectDetector();
      state.aiOn = true;
      await state.detector.setOptions({ runningMode: 'VIDEO', scoreThreshold: state.confidence, maxResults: CONFIG.maxObjects });
      els.aiBtn.querySelector('small').textContent = 'Detecting on-device';
      els.aiBtn.classList.add('loaded');
      els.hint.textContent = 'OBJECT AI ACTIVE · LOCAL INFERENCE';
      setSystemState('AI ACTIVE');
      log('Object AI is active. Detected labels and confidence scores will appear on the HUD.', 'success');
      toast('Object AI active. Point the camera at objects.');
    } catch (_) { state.aiOn = false; }
  } else {
    state.aiOn = false;
    state.detectionResults = [];
    els.aiBtn.querySelector('small').textContent = state.detector ? 'Model ready · OFF' : 'Not loaded';
    setSystemState(state.stream ? 'CAMERA LIVE' : 'READY');
    els.objectCount.textContent = '0';
    log('Object detection paused. Model remains loaded.', 'info');
  }
}

async function loadRoadSegmenter() {
  if (state.segmenter) return state.segmenter;
  if (state.roadLoading) throw new Error('Road AI is already loading.');
  state.roadLoading = true;
  els.roadBtn.disabled = true;
  els.roadBtn.querySelector('small').textContent = 'Loading model…';
  els.hint.textContent = 'LOADING ROAD SEGMENTATION MODEL';
  setSystemState('LOADING ROAD AI');
  log('Loading SegFormer ADE20K semantic-segmentation model. First load needs internet and storage.', 'info');
  try {
    if (!state.transformersModulePromise) state.transformersModulePromise = import(CONFIG.transformersUrl);
    const transformers = await state.transformersModulePromise;
    // Keep ONNX CPU inference conservative on older mobile devices.
    try {
      transformers.env.useBrowserCache = true;
      transformers.env.useWasmCache = true;
      transformers.env.allowRemoteModels = true;
      if (transformers.env.backends?.onnx?.wasm) {
        transformers.env.backends.onnx.wasm.numThreads = 1;
        transformers.env.backends.onnx.wasm.proxy = true;
      }
    } catch (_) {}
    state.segmenter = await transformers.pipeline('image-segmentation', CONFIG.roadModel, {
      device: 'wasm',
      progress_callback: (progress) => {
        if (progress?.status === 'progress' && Number.isFinite(progress.progress)) {
          els.roadBtn.querySelector('small').textContent = `Downloading ${Math.round(progress.progress)}%`;
        } else if (progress?.status) {
          const shortStatus = String(progress.status).replaceAll('-', ' ');
          els.roadBtn.querySelector('small').textContent = shortStatus.slice(0, 24);
        }
      }
    });
    els.roadBtn.classList.add('loaded');
    els.roadBtn.querySelector('small').textContent = 'Model ready · OFF';
    log('Road segmentation model loaded. Road overlay uses semantic AI masks, not a fake perspective grid.', 'success');
    return state.segmenter;
  } catch (error) {
    state.segmenter = null;
    els.roadBtn.querySelector('small').textContent = 'Load failed · Retry';
    const message = error?.message || 'Road segmentation model could not be loaded.';
    log(`Road AI load failed: ${message}`, 'error');
    toast(`Road AI failed: ${message}`, 'error');
    throw error;
  } finally {
    state.roadLoading = false;
    els.roadBtn.disabled = false;
    if (!state.roadOn) setSystemState(state.stream ? (state.aiOn ? 'AI ACTIVE' : 'CAMERA LIVE') : 'READY');
  }
}

async function toggleRoadAI(forceValue) {
  const desired = typeof forceValue === 'boolean' ? forceValue : !state.roadOn;
  if (desired === state.roadOn) return;
  if (desired && !state.stream) {
    toast('Start the camera before enabling road AI.', 'error');
    log('Road AI not started: camera is off.', 'error');
    return;
  }
  if (desired) {
    try {
      await loadRoadSegmenter();
      state.roadOn = true;
      state.lastRoadInference = 0;
      els.roadBtn.querySelector('small').textContent = 'Road mask active';
      els.roadBtn.classList.add('loaded');
      els.hint.textContent = 'ROAD SEGMENTATION ACTIVE · AI MASK';
      setSystemState('SCANNING');
      log('Road AI active. It segments visible road pixels in sampled frames; the mask may update slowly on older phones.', 'success');
      toast('Road AI active. Keep camera pointed at a clear road surface.');
    } catch (_) { state.roadOn = false; }
  } else {
    state.roadOn = false;
    state.roadMaskCanvas = null;
    state.roadMaskFound = false;
    els.roadState.textContent = 'OFFLINE';
    els.roadBtn.querySelector('small').textContent = state.segmenter ? 'Model ready · OFF' : 'Not loaded';
    setSystemState(state.stream ? (state.aiOn ? 'AI ACTIVE' : 'CAMERA LIVE') : 'READY');
    log('Road segmentation paused. Model remains loaded.', 'info');
  }
}

function assignTrackIds(detections) {
  const now = performance.now();
  const old = state.tracks.filter(t => now - t.lastSeen < 2200);
  const used = new Set();
  const nextTracks = [];
  const current = detections.map(d => {
    const box = d.boundingBox;
    const cx = box.originX + box.width / 2;
    const cy = box.originY + box.height / 2;
    const category = d.categories?.[0]?.categoryName || 'object';
    let best = null, bestDistance = Infinity;
    for (const track of old) {
      if (used.has(track.id) || track.label !== category) continue;
      const distance = Math.hypot(cx - track.cx, cy - track.cy);
      const limit = Math.max(55, Math.min(160, Math.max(box.width, box.height) * 0.85));
      if (distance < limit && distance < bestDistance) { best = track; bestDistance = distance; }
    }
    const id = best ? best.id : state.nextTrackId++;
    if (best) used.add(best.id);
    const track = { id, label: category, cx, cy, lastSeen: now };
    nextTracks.push(track);
    return { ...d, trackId: id };
  });
  state.tracks = [...old.filter(t => !used.has(t.id)), ...nextTracks];
  return current;
}

function drawRoadMask(ctx, width, height) {
  if (!state.roadOn || !state.roadMaskCanvas || !state.roadMaskFound) return;
  ctx.save();
  ctx.globalAlpha = 0.58;
  ctx.drawImage(state.roadMaskCanvas, 0, 0, width, height);
  ctx.restore();
}

function drawPerspectiveGrid(ctx, w, h) {
  if (!state.gridOn || !state.hudOn) return;
  const horizon = h * 0.54;
  ctx.save();
  ctx.strokeStyle = 'rgba(68,220,255,.22)';
  ctx.lineWidth = Math.max(1, w / 900);
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(w * 0.5 + i * w * 0.07, h); ctx.lineTo(w * 0.5 + i * w * 0.012, horizon); ctx.stroke();
  }
  for (let j = 1; j <= 12; j++) {
    const t = j / 12;
    const y = horizon + (h - horizon) * t * t;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}

function drawDetections(ctx) {
  if (!state.hudOn || !state.aiOn) return;
  const w = els.canvas.width, h = els.canvas.height;
  ctx.save();
  ctx.lineWidth = Math.max(2, w / 700);
  ctx.font = `bold ${Math.max(12, w / 48)}px ui-monospace,monospace`;
  for (const detection of state.detectionResults) {
    const box = detection.boundingBox;
    const category = detection.categories?.[0];
    if (!box || !category) continue;
    const x = box.originX, y = box.originY, bw = box.width, bh = box.height;
    const score = Math.round((category.score || 0) * 100);
    const label = `${String(category.categoryName || 'OBJECT').toUpperCase()} #${detection.trackId} ${score}%`;
    ctx.strokeStyle = 'rgba(80,237,255,.96)';
    ctx.shadowColor = 'rgba(50,220,255,.75)'; ctx.shadowBlur = 8;
    const corner = Math.max(10, Math.min(bw, bh) * 0.18);
    ctx.beginPath();
    ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y);
    ctx.moveTo(x + bw - corner, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + corner);
    ctx.moveTo(x, y + bh - corner); ctx.lineTo(x, y + bh); ctx.lineTo(x + corner, y + bh);
    ctx.moveTo(x + bw - corner, y + bh); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw, y + bh - corner);
    ctx.stroke(); ctx.shadowBlur = 0;
    const textWidth = ctx.measureText(label).width;
    const labelY = Math.max(22, y - 7);
    ctx.fillStyle = 'rgba(3,18,29,.88)';
    ctx.fillRect(x, labelY - Math.max(17, w / 60), Math.min(textWidth + 12, w - x), Math.max(20, w / 52));
    ctx.fillStyle = '#8ff5ff';
    ctx.fillText(label, x + 5, labelY);
  }
  ctx.restore();
}

function renderLoop() {
  state.raf = requestAnimationFrame(renderLoop);
  if (document.hidden) return;
  const video = els.video;
  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;
  if (state.stream && video.readyState >= 2 && video.videoWidth > 0) {
    resizeCanvas();
    const w = els.canvas.width, h = els.canvas.height;
    ctx.clearRect(0, 0, w, h);
    drawRoadMask(ctx, w, h);
    drawPerspectiveGrid(ctx, w, h);
    drawDetections(ctx);
    maybeInferObjects();
    maybeInferRoad();
  } else if (!state.stream && (els.canvas.width || els.canvas.height)) {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    drawPerspectiveGrid(ctx, els.canvas.width || els.stage.clientWidth, els.canvas.height || els.stage.clientHeight);
  }
}

function maybeInferObjects() {
  if (!state.aiOn || !state.detector || !state.stream || state.contextLost) return;
  const now = performance.now();
  if (now - state.lastDetectionInference < state.detectionInterval || els.video.currentTime === state.lastVideoTime) return;
  state.lastDetectionInference = now;
  state.lastVideoTime = els.video.currentTime;
  try {
    const result = state.detector.detectForVideo(els.video, now);
    state.detectionResults = assignTrackIds(result.detections || []);
    state.inferenceMs = performance.now() - now;
    els.objectCount.textContent = String(state.detectionResults.length);
    els.inferenceTime.textContent = `${Math.round(state.inferenceMs)} ms`;
    state.detectionsThisSecond++;
    if (!state.detectionTimer) state.detectionTimer = setInterval(() => {
      els.fpsValue.textContent = String(state.detectionsThisSecond);
      state.detectionsThisSecond = 0;
    }, 1000);
  } catch (error) {
    state.aiOn = false;
    els.aiBtn.querySelector('small').textContent = 'Inference failed · Retry';
    log(`Object inference stopped: ${error.message || error}`, 'error');
    toast('Object AI stopped after an inference error. Tap Object AI to retry.', 'error');
  }
}

async function maybeInferRoad() {
  if (!state.roadOn || !state.segmenter || !state.stream || state.roadInferenceBusy || !els.video.videoWidth) return;
  const now = performance.now();
  if (now - state.lastRoadInference < CONFIG.minRoadInterval) return;
  state.lastRoadInference = now;
  state.roadInferenceBusy = true;
  try {
    const vw = els.video.videoWidth, vh = els.video.videoHeight;
    const scale = Math.min(1, CONFIG.roadInferenceSize / Math.max(vw, vh));
    const input = document.createElement('canvas');
    input.width = Math.max(64, Math.round(vw * scale));
    input.height = Math.max(64, Math.round(vh * scale));
    const inputCtx = input.getContext('2d', { willReadFrequently: true });
    inputCtx.drawImage(els.video, 0, 0, input.width, input.height);
    const outputs = await state.segmenter(input, { subtask: 'semantic' });
    const road = Array.isArray(outputs) ? outputs.find(item => ['road', 'street'].includes(String(item.label).toLowerCase())) : null;
    if (!road?.mask?.data || !road.mask.width || !road.mask.height) {
      state.roadMaskCanvas = null;
      state.roadMaskFound = false;
      els.roadState.textContent = 'NO ROAD';
      els.roadBtn.querySelector('small').textContent = 'Active · no road mask';
      return;
    }
    const mask = road.mask;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width; maskCanvas.height = mask.height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const pixels = maskCtx.createImageData(mask.width, mask.height);
    const data = mask.data;
    const channels = mask.channels || Math.max(1, Math.round(data.length / (mask.width * mask.height)));
    for (let i = 0; i < mask.width * mask.height; i++) {
      const raw = data[i * channels] ?? 0;
      // Most Transformers.js semantic masks are grayscale (0–255), with the class region set to white.
      const value = raw > 1 ? raw / 255 : raw;
      const offset = i * 4;
      pixels.data[offset] = 30;
      pixels.data[offset + 1] = 230;
      pixels.data[offset + 2] = 255;
      pixels.data[offset + 3] = value >= 0.35 ? Math.round(155 * Math.min(1, value * 1.2)) : 0;
    }
    maskCtx.putImageData(pixels, 0, 0);
    const displayMask = document.createElement('canvas');
    displayMask.width = vw; displayMask.height = vh;
    const displayCtx = displayMask.getContext('2d');
    displayCtx.imageSmoothingEnabled = true;
    displayCtx.drawImage(maskCanvas, 0, 0, vw, vh);
    state.roadMaskCanvas = displayMask;
    state.roadMaskFound = true;
    els.roadState.textContent = 'ROAD FOUND';
    els.roadBtn.querySelector('small').textContent = 'Road mask active';
    if (Math.random() < 0.05) log('Road pixels segmented in the latest camera sample.', 'success');
  } catch (error) {
    log(`Road segmentation frame failed: ${error.message || error}`, 'error');
    els.roadState.textContent = 'RETRYING';
  } finally {
    state.roadInferenceBusy = false;
  }
}

function setGrid(value) {
  state.gridOn = typeof value === 'boolean' ? value : !state.gridOn;
  buttonState(els.gridBtn, state.gridOn);
  toast(`Perspective grid ${state.gridOn ? 'on' : 'off'}.`);
}
function setHud(value) {
  state.hudOn = typeof value === 'boolean' ? value : !state.hudOn;
  buttonState(els.hudBtn, state.hudOn);
  els.canvas.style.opacity = state.hudOn ? '1' : '0';
  toast(`HUD graphics ${state.hudOn ? 'on' : 'off'}.`);
}

async function toggleTorch(forceValue) {
  const desired = typeof forceValue === 'boolean' ? forceValue : !state.torchOn;
  const track = state.stream?.getVideoTracks()[0];
  if (!track) { toast('Start the rear camera before using flashlight.', 'error'); return; }
  if (!state.torchSupported || !track.applyConstraints) { toast('Flashlight control is not supported by this camera/browser.', 'error'); return; }
  try {
    await track.applyConstraints({ advanced: [{ torch: desired }] });
    state.torchOn = desired;
    buttonState(els.torchBtn, desired);
    log(`Flashlight ${desired ? 'enabled' : 'disabled'}.`, 'success');
  } catch (error) {
    log(`Flashlight control unavailable: ${error.message || error}`, 'error');
    toast('This phone/browser did not allow flashlight control.', 'error');
  }
}

function captureFrame() {
  if (!state.stream || !els.video.videoWidth) {
    toast('Start the camera before capturing.', 'error'); return;
  }
  const output = document.createElement('canvas');
  output.width = els.video.videoWidth; output.height = els.video.videoHeight;
  const ctx = output.getContext('2d');
  ctx.drawImage(els.video, 0, 0, output.width, output.height);
  if (state.roadOn && state.roadMaskCanvas && state.roadMaskFound) { ctx.save(); ctx.globalAlpha = .58; ctx.drawImage(state.roadMaskCanvas, 0, 0, output.width, output.height); ctx.restore(); }
  if (state.gridOn) drawGridToCanvas(ctx, output.width, output.height);
  if (state.hudOn && state.aiOn) drawLabelsToCanvas(ctx, output.width, output.height);
  output.toBlob(blob => {
    if (!blob) { toast('Capture could not be encoded.', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JARVIS-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    log('Snapshot captured with current active overlays.', 'success');
    toast('Capture saved to browser downloads.');
  }, 'image/png');
}

function drawGridToCanvas(ctx, w, h) {
  ctx.save(); ctx.strokeStyle = 'rgba(68,220,255,.22)'; ctx.lineWidth = Math.max(1, w / 900);
  const horizon = h * .54;
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(w * .5 + i * w * .07, h); ctx.lineTo(w * .5 + i * w * .012, horizon); ctx.stroke(); }
  for (let j = 1; j <= 12; j++) { const t = j / 12; const y = horizon + (h - horizon) * t * t; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}
function drawLabelsToCanvas(ctx, w, h) {
  const oldWidth = els.canvas.width, oldHeight = els.canvas.height;
  // Coordinates are already in video-pixel dimensions.
  ctx.save(); ctx.lineWidth = Math.max(2, w / 700); ctx.font = `bold ${Math.max(12, w / 48)}px monospace`;
  for (const detection of state.detectionResults) {
    const box = detection.boundingBox, category = detection.categories?.[0]; if (!box || !category) continue;
    ctx.strokeStyle = '#63e4ff'; ctx.strokeRect(box.originX, box.originY, box.width, box.height);
    ctx.fillStyle = 'rgba(3,18,29,.85)';
    const label = `${category.categoryName} #${detection.trackId} ${Math.round((category.score || 0) * 100)}%`;
    const y = Math.max(22, box.originY - 6); ctx.fillRect(box.originX, y - 20, ctx.measureText(label).width + 10, 23); ctx.fillStyle='#8ff5ff'; ctx.fillText(label, box.originX + 4, y - 3);
  }
  ctx.restore();
}

function getSpeechSynthesis() { return 'speechSynthesis' in window ? window.speechSynthesis : null; }
function getAvailableVoices() { return getSpeechSynthesis()?.getVoices?.() || []; }
function pickPreferredVoice() {
  const voices = state.voiceList.length ? state.voiceList : getAvailableVoices();
  if (state.selectedVoiceURI) {
    const selected = voices.find(v => v.voiceURI === state.selectedVoiceURI);
    if (selected) return selected;
  }
  const english = voices.filter(v => /^en(-|_)/i.test(v.lang || ''));
  const maleName = /(?:^|[\s_-])male(?:$|[\s_-])|david|mark|james|daniel|george|guy|ryan|aaron|arthur|fred/i;
  return english.find(v => maleName.test(`${v.name} ${v.voiceURI}`)) ||
    english.find(v => /en-IN/i.test(v.lang)) ||
    english.find(v => /google|microsoft|english/i.test(v.name)) ||
    voices[0] || null;
}
function refreshVoices() {
  const voices = getAvailableVoices();
  state.voiceList = voices;
  const oldValue = els.voiceSelect.value || state.selectedVoiceURI;
  els.voiceSelect.replaceChildren(new Option('Auto · preferred available voice', ''));
  voices.forEach((voice, index) => {
    const option = new Option(`${voice.name} (${voice.lang || 'unknown'})`, voice.voiceURI || `voice-${index}`);
    els.voiceSelect.add(option);
  });
  if (voices.some(v => v.voiceURI === oldValue)) els.voiceSelect.value = oldValue;
  if (!voices.length) els.voiceSelect.value = '';
  updateVoiceStatus();
}
function updateVoiceStatus() {
  if (!getSpeechSynthesis()) els.voiceState.textContent = 'Speech synthesis is not available in this browser';
  else {
    const voice = pickPreferredVoice();
    els.voiceState.textContent = voice ? `Voice output ready · ${voice.name}` : 'Voice output ready · system default';
  }
}
function speak(text, announce = false) {
  const synth = getSpeechSynthesis();
  if (!synth || !('SpeechSynthesisUtterance' in window)) {
    toast('This browser does not support speech output.', 'error');
    log('Speech synthesis is unavailable.', 'error'); return;
  }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickPreferredVoice();
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang || 'en-IN'; }
  else utterance.lang = els.speechLang.value || 'en-IN';
  utterance.rate = 0.94;
  utterance.pitch = 0.82;
  utterance.volume = 1;
  utterance.onstart = () => { if (announce) els.voiceState.textContent = 'Speaking system response…'; };
  utterance.onend = () => updateVoiceStatus();
  utterance.onerror = (event) => { log(`Voice output error: ${event.error || 'unknown error'}`, 'error'); updateVoiceStatus(); };
  try { synth.speak(utterance); } catch (error) { toast(`Voice error: ${error.message}`, 'error'); }
}
function buildStatusReport() {
  const camera = state.stream ? 'camera online' : 'camera offline';
  const objects = state.aiOn ? `${state.detectionResults.length} objects detected in latest frame` : 'object detection inactive';
  const road = state.roadOn ? (state.roadMaskFound ? 'road segmentation active' : 'road model active, no road mask in latest frame') : 'road segmentation inactive';
  return `J.A.R.V.I.S reporting. ${camera}. ${objects}. ${road}.`;
}

function getRecognitionClass() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function listenForCommand() {
  const Recognition = getRecognitionClass();
  if (!Recognition) {
    const message = 'Speech recognition is not supported by this browser. Try Chrome on Android, or use the on-screen buttons.';
    els.voiceState.textContent = message;
    log(message, 'error'); toast(message, 'error'); return;
  }
  if (state.listening) { try { state.recognition?.stop(); } catch (_) {} return; }
  const recognition = new Recognition();
  state.recognition = recognition;
  recognition.lang = els.speechLang.value || 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  recognition.onstart = () => {
    state.listening = true;
    els.voiceCommandBtn.textContent = 'Listening… tap to cancel';
    els.voiceState.textContent = 'Listening for a command…';
    log('Listening for one voice command.', 'info');
  };
  recognition.onresult = event => {
    const alternatives = Array.from(event.results?.[0] || []);
    const transcript = alternatives.map(item => item.transcript).join(' ').trim();
    state.lastCommand = transcript;
    log(`Voice command heard: “${transcript || 'no speech'}”`, transcript ? 'success' : 'error');
    if (transcript) dispatchVoiceCommand(transcript);
  };
  recognition.onerror = event => {
    const message = event.error === 'not-allowed' ? 'Microphone permission denied. Allow microphone access and retry.' : `Voice command error: ${event.error}`;
    els.voiceState.textContent = message;
    log(message, 'error');
  };
  recognition.onend = () => {
    state.listening = false;
    els.voiceCommandBtn.textContent = '🎙 Speak command';
    updateVoiceStatus();
  };
  try { recognition.start(); }
  catch (error) { state.listening = false; log(`Could not start voice recognition: ${error.message}`, 'error'); toast('Could not start voice recognition. Try again.', 'error'); }
}

function dispatchVoiceCommand(input) {
  const text = input.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const has = (...words) => words.some(word => text.includes(word));
  let action = '';
  if (has('status report', 'system status', 'report status', 'how are you')) { speak(buildStatusReport(), true); action = 'status report'; }
  else if (has('capture photo', 'take photo', 'take picture', 'capture frame', 'take snapshot')) { captureFrame(); action = 'capture'; }
  else if (has('switch camera', 'change camera', 'front camera', 'rear camera', 'back camera')) { switchCamera(); action = 'switch camera'; }
  else if (has('flashlight on', 'torch on', 'turn on flashlight')) { toggleTorch(true); action = 'flashlight on'; }
  else if (has('flashlight off', 'torch off', 'turn off flashlight')) { toggleTorch(false); action = 'flashlight off'; }
  else if (has('road detection on', 'road ai on', 'road guide on', 'enable road')) { toggleRoadAI(true); action = 'road AI on'; }
  else if (has('road detection off', 'road ai off', 'road guide off', 'disable road')) { toggleRoadAI(false); action = 'road AI off'; }
  else if (has('ai off', 'object detection off', 'stop object detection')) { toggleObjectAI(false); action = 'object AI off'; }
  else if (has('ai on', 'object detection on', 'start object detection', 'enable object')) { toggleObjectAI(true); action = 'object AI on'; }
  else if (has('grid off', 'hide grid')) { setGrid(false); action = 'grid off'; }
  else if (has('grid on', 'show grid')) { setGrid(true); action = 'grid on'; }
  else if (has('hud off', 'hide hud')) { setHud(false); action = 'HUD off'; }
  else if (has('hud on', 'show hud')) { setHud(true); action = 'HUD on'; }
  else if (has('stop camera', 'camera off', 'close camera')) { stopCamera(); action = 'camera off'; }
  else if (has('start camera', 'camera on', 'open camera')) { if (!state.stream) startCamera(); else toast('Camera is already online.'); action = 'camera on'; }
  else if (has('stop all', 'shutdown vision', 'stand by', 'standby')) { stopCamera(); speak('J.A.R.V.I.S going to standby.', true); action = 'standby'; }
  else {
    speak('Command not recognized. Try start camera, AI on, road AI on, grid on, capture photo, or status report.', true);
    toast('Command not recognized. Check the console for command examples.', 'error');
    action = 'unrecognized command';
  }
  if (action !== 'status report') speak(`Command received. ${action}.`, false);
}

function registerInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredInstall = event;
    els.installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    state.deferredInstall = null;
    els.installBtn.hidden = true;
    log('PWA installed on this device.', 'success');
    toast('J.A.R.V.I.S installed.');
  });
}
async function installPWA() {
  if (!state.deferredInstall) {
    toast('In Chrome, open the browser menu and choose Install app or Add to Home screen.');
    return;
  }
  state.deferredInstall.prompt();
  const choice = await state.deferredInstall.userChoice;
  log(`Install prompt: ${choice.outcome}.`, 'info');
  state.deferredInstall = null;
  els.installBtn.hidden = true;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !isSecureCameraContext()) {
    log('Service worker unavailable in this context. Open the deployed HTTPS site to install the app.', 'info');
    return;
  }
  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(() => log('Offline app shell registered. AI runtimes/models have separate cache requirements.', 'success'))
    .catch(error => log(`Offline shell registration failed: ${error.message}`, 'error'));
}

function bindEvents() {
  els.cameraBtn.addEventListener('click', startCamera);
  els.aiBtn.addEventListener('click', () => toggleObjectAI());
  els.roadBtn.addEventListener('click', () => toggleRoadAI());
  els.switchBtn.addEventListener('click', switchCamera);
  els.gridBtn.addEventListener('click', () => setGrid());
  els.hudBtn.addEventListener('click', () => setHud());
  els.captureBtn.addEventListener('click', captureFrame);
  els.torchBtn.addEventListener('click', () => toggleTorch());
  els.stopBtn.addEventListener('click', async () => { await stopCamera(); if (state.listening) state.recognition?.stop(); speak('J.A.R.V.I.S is standing by.', true); });
  els.speakBtn.addEventListener('click', () => speak(buildStatusReport(), true));
  els.voiceCommandBtn.addEventListener('click', listenForCommand);
  els.testVoiceBtn.addEventListener('click', () => speak('J.A.R.V.I.S online. All systems standing by. Visual sensors ready.', true));
  els.installBtn.addEventListener('click', installPWA);
  els.settingsBtn.addEventListener('click', () => { if (els.settingsDialog.showModal) els.settingsDialog.showModal(); else toast('Settings dialog is not supported by this browser.'); });
  els.confidenceRange.addEventListener('input', () => { state.confidence = Number(els.confidenceRange.value) / 100; els.confidenceOutput.textContent = `${els.confidenceRange.value}%`; });
  els.confidenceRange.addEventListener('change', async () => { if (state.detector) { try { await state.detector.setOptions({ scoreThreshold: state.confidence }); log(`Detection confidence changed to ${Math.round(state.confidence * 100)}%.`, 'info'); } catch (error) { log(`Could not update confidence: ${error.message}`, 'error'); } } });
  els.detRate.addEventListener('change', () => { state.detectionInterval = Number(els.detRate.value); log(`Object inference interval set to ${state.detectionInterval} ms.`, 'info'); });
  els.voiceSelect.addEventListener('change', () => { state.selectedVoiceURI = els.voiceSelect.value; updateVoiceStatus(); });
  els.speechLang.addEventListener('change', () => { if (!state.selectedVoiceURI) updateVoiceStatus(); });
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('pagehide', () => { if (state.stream) state.stream.getTracks().forEach(track => track.stop()); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.stream) {
      // Keep privacy and battery behavior predictable in background tabs.
      log('App moved to background; camera stream paused for privacy. Tap Start camera after returning.', 'info');
      stopCamera();
    }
  });
}

function initializeClock() {
  const update = () => { els.clockValue.textContent = new Date().toLocaleTimeString([], { hour12: false }); };
  update(); setInterval(update, 1000);
}

bindEvents();
registerInstallPrompt();
registerServiceWorker();
initializeClock();
refreshVoices();
if (getSpeechSynthesis()) getSpeechSynthesis().addEventListener?.('voiceschanged', refreshVoices);
setCameraStatus(false, 'CAMERA STANDBY', 'Awaiting permission');
setSystemState('READY');
els.roadBtn.disabled = false;
els.torchBtn.disabled = true;
log('J.A.R.V.I.S initialized.', 'success');
log('Object AI uses MediaPipe EfficientDet Lite0 (COCO classes).', 'info');
log('Road AI uses SegFormer ADE20K semantic segmentation. It may be slow on older phones.', 'info');
if (!getRecognitionClass()) log('Voice input may be unavailable in this browser; on-screen controls remain usable.', 'info');
