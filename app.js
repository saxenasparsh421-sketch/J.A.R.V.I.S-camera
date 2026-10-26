'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    video: $('cameraVideo'), canvas: $('hudCanvas'), stage: $('previewStage'), empty: $('emptyPreview'),
    cameraBtn: $('cameraBtn'), aiBtn: $('aiBtn'), switchBtn: $('switchBtn'), roadBtn: $('roadBtn'), gridBtn: $('gridBtn'), hudBtn: $('hudBtn'), torchBtn: $('torchBtn'), captureBtn: $('captureBtn'), voiceBtn: $('voiceBtn'), voiceCommandBtn: $('voiceCommandBtn'), fullscreenBtn: $('fullscreenBtn'), installBtn: $('installBtn'),
    systemLed: $('systemLed'), systemState: $('systemState'), systemSubstate: $('systemSubstate'), feedBadge: $('feedBadge'), aiBadge: $('aiBadge'), viewModeLabel: $('viewModeLabel'), viewClock: $('viewClock'), viewResolution: $('viewResolution'), fpsLabel: $('fpsLabel'), objectCount: $('objectCount'), objectSummary: $('objectSummary'), inferenceTime: $('inferenceTime'), batteryValue: $('batteryValue'), batterySub: $('batterySub'), diagTime: $('diagTime'), diagCamera: $('diagCamera'), diagAI: $('diagAI'), diagNetwork: $('diagNetwork'), diagnosticMessage: $('diagnosticMessage'), toast: $('toast'), captureCanvas: $('captureCanvas'), appShell: document.querySelector('.app-shell')
  };
  const state = {
    stream: null, detector: null, detectorPromise: null, facing: 'environment', cameraOn: false,
    aiOn: false, hudOn: true, gridOn: true, roadOn: false, torchOn: false, animationId: 0,
    lastDetectAt: 0, lastDetectDuration: 0, lastDetections: [], frameSamples: 0, lastFpsAt: performance.now(), fps: 0,
    toastTimer: 0, installPrompt: null, wakeLock: null, lastCameraError: '', stoppedByUser: false, drawErrorShown: false,
    lastRoadUpdate: 0, roadConfidence: 0, loadedModelLabel: 'NOT LOADED', lastSpokenAt: 0, voiceRecognition: null, voiceListening: false
  };
  const ctx = els.canvas.getContext('2d', { alpha: true });
  let stageWidth = 1, stageHeight = 1, dpr = 1;

  function safeText(el, value) { if (el) el.textContent = String(value); }
  function pad(v) { return String(v).padStart(2, '0'); }
  function clockText() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
  function setMessage(text) { els.diagnosticMessage.lastElementChild.textContent = text; }
  function toast(message, duration = 2800) {
    safeText(els.toast, message); els.toast.classList.add('visible');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => els.toast.classList.remove('visible'), duration);
  }
  function setSwitch(id, active) { const el = $(id); if (el) el.classList.toggle('active', !!active); }
  function setButtonEnabled(el, enabled) { if (el) el.disabled = !enabled; }
  function updateSystemState() {
    els.systemLed.classList.toggle('active', state.cameraOn);
    safeText(els.systemState, state.cameraOn ? (state.aiOn ? 'SCANNING' : 'CAMERA ACTIVE') : 'STANDBY');
    safeText(els.systemSubstate, state.cameraOn ? (state.aiOn ? 'ON-DEVICE VISION' : 'LOCAL SENSOR') : 'LOCAL SYSTEM');
    safeText(els.feedBadge, state.cameraOn ? 'LIVE FEED' : 'CAMERA OFF');
    els.feedBadge.classList.toggle('active', state.cameraOn);
    safeText(els.aiBadge, state.aiOn ? 'AI ACTIVE' : 'AI STANDBY');
    els.aiBadge.classList.toggle('active', state.aiOn);
    safeText(els.viewModeLabel, state.cameraOn ? `OPTICAL SENSOR // ${state.facing === 'environment' ? 'REAR' : 'FRONT'}` : 'OPTICAL SENSOR // IDLE');
    safeText(els.diagCamera, state.cameraOn ? state.facing.toUpperCase() : 'INACTIVE');
    safeText(els.diagAI, state.detector ? 'MEDIAPIPE LITE' : state.loadedModelLabel);
    safeText(els.cameraBtn.querySelector('strong'), state.cameraOn ? 'Stop camera' : 'Start camera');
    safeText(els.cameraBtn.querySelector('small'), state.cameraOn ? 'Release camera sensor' : 'Activate visual feed');
    safeText(els.aiBtn.querySelector('small'), state.aiOn ? 'Detection enabled' : 'Objects in view');
    safeText(els.voiceCommandBtn.querySelector('strong'), state.voiceListening ? 'Listening…' : 'Voice commands');
    safeText(els.voiceCommandBtn.querySelector('small'), state.voiceListening ? 'Say one command clearly' : 'Tap and speak a command');
    setSwitch('voiceSwitch', state.voiceListening);
    els.video.classList.toggle('mirrored', state.facing === 'user');
    setSwitch('aiSwitch', state.aiOn); setSwitch('roadSwitch', state.roadOn); setSwitch('gridSwitch', state.gridOn); setSwitch('hudSwitch', state.hudOn); setSwitch('torchSwitch', state.torchOn);
    els.appShell.classList.toggle('hud-disabled', !state.hudOn);
  }
  function announce(message) {
    // Speech synthesis runs locally where the browser offers a local voice.
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { toast('Voice output is not supported by this browser.'); return; }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-IN'; utterance.rate = 0.95; utterance.pitch = 0.82; utterance.volume = 0.85;
      window.speechSynthesis.speak(utterance); state.lastSpokenAt = Date.now(); toast('J.A.R.V.I.S voice status initiated.');
    } catch (err) { toast('Voice output could not start.'); }
  }
  function resizeCanvas() {
    const rect = els.stage.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width); stageHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(stageWidth * dpr), h = Math.round(stageHeight * dpr);
    if (els.canvas.width !== w || els.canvas.height !== h) { els.canvas.width = w; els.canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function line(x1,y1,x2,y2,color='rgba(102,231,237,.28)',width=1,dash=[]) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke(); ctx.setLineDash([]);
  }
  function drawGrid() {
    const w=stageWidth,h=stageHeight,horizon=h*.55;
    ctx.save(); ctx.lineWidth=.65;
    // Perspective reference grid, explicitly a visual aid, not a reconstructed road mesh.
    const fade=ctx.createLinearGradient(0,horizon,0,h); fade.addColorStop(0,'rgba(102,231,237,.015)'); fade.addColorStop(1,'rgba(102,231,237,.18)'); ctx.strokeStyle=fade;
    for(let i=0;i<=12;i++){const x=(w/12)*i;line(w*.5,horizon,x,h,'rgba(102,231,237,.15)',.65);}
    for(let j=0;j<14;j++){const t=(j+1)/14;const y=horizon+(h-horizon)*t*t;line(0,y,w,y,`rgba(102,231,237,${.045+t*.095})`,.65);}
    line(0,horizon,w,horizon,'rgba(102,231,237,.16)',.7,[4,6]);
    ctx.restore();
  }
  function drawRoadGuide() {
    const w=stageWidth,h=stageHeight; const vanX=w*.51, vanY=h*.55;
    ctx.save();
    const road=ctx.createLinearGradient(0,vanY,0,h); road.addColorStop(0,'rgba(36,211,222,.015)'); road.addColorStop(1,'rgba(36,211,222,.12)');
    ctx.beginPath();ctx.moveTo(vanX-w*.04,vanY);ctx.lineTo(vanX+w*.04,vanY);ctx.lineTo(w*.94,h);ctx.lineTo(w*.06,h);ctx.closePath();ctx.fillStyle=road;ctx.fill();ctx.strokeStyle='rgba(102,231,237,.6)';ctx.lineWidth=1;ctx.setLineDash([6,5]);ctx.stroke();ctx.setLineDash([]);
    for(let i=1;i<=4;i++){const t=i/5;const y=vanY+(h-vanY)*t*t;const half=w*(.04+.43*t);line(vanX-half,y,vanX+half,y,'rgba(102,231,237,.28)',.7,[3,7]);}
    line(vanX,vanY+7,w*.12,h,'rgba(102,231,237,.28)',.65,[4,7]);line(vanX,vanY+7,w*.88,h,'rgba(102,231,237,.28)',.65,[4,7]);
    ctx.fillStyle='rgba(5,15,21,.72)';ctx.fillRect(w*.5-67,vanY-18,134,15);ctx.fillStyle='rgba(176,255,241,.87)';ctx.font='600 8px Rajdhani, sans-serif';ctx.textAlign='center';ctx.fillText('ROAD GUIDE / ESTIMATED',w*.5,vanY-8);
    ctx.restore();
  }
  function videoTransform() {
    const vw=els.video.videoWidth||stageWidth, vh=els.video.videoHeight||stageHeight;
    const scale=Math.max(stageWidth/vw,stageHeight/vh); const outW=vw*scale,outH=vh*scale;
    return {scale,offX:(stageWidth-outW)/2,offY:(stageHeight-outH)/2,vw,vh};
  }
  function drawDetections() {
    if(!state.cameraOn || !state.lastDetections.length || !els.video.videoWidth) return;
    const map=videoTransform(); ctx.save();
    state.lastDetections.forEach((d,index)=>{
      const b=d.boundingBox||{}; let sx=b.originX||0; const sy=b.originY||0; const bw=b.width||0,bh=b.height||0;
      if(state.facing==='user') sx=map.vw-(sx+bw);
      const x=sx*map.scale+map.offX, y=sy*map.scale+map.offY, w=bw*map.scale,h=bh*map.scale;
      if(x+w<0||x>stageWidth||y+h<0||y>stageHeight) return;
      const cat=(d.categories&&d.categories[0])||{};const label=String(cat.categoryName||cat.displayName||'OBJECT').toUpperCase();const score=Math.round((cat.score||0)*100);
      ctx.strokeStyle='rgba(102,231,237,.96)';ctx.lineWidth=1.25;ctx.strokeRect(x,y,w,h);
      const size=Math.min(13,Math.max(8,Math.min(w,h)*.22));const l=Math.max(7,size);ctx.lineWidth=1.8;
      line(x,y,x+l,y,'#b0fff1',1.8);line(x,y,x,y+l,'#b0fff1',1.8);line(x+w,y,x+w-l,y,'#b0fff1',1.8);line(x+w,y,x+w,y+l,'#b0fff1',1.8);line(x,y+h,x+l,y+h,'#b0fff1',1.8);line(x,y+h,x,y+h-l,'#b0fff1',1.8);line(x+w,y+h,x+w-l,y+h,'#b0fff1',1.8);line(x+w,y+h,x+w,y+h-l,'#b0fff1',1.8);
      ctx.font='700 10px Rajdhani, sans-serif';const title=`${label} ${score}%`;const tw=Math.min(stageWidth-24,ctx.measureText(title).width+11);const labelY=Math.max(6,y-19);
      ctx.fillStyle='rgba(4,18,25,.88)';ctx.fillRect(x,labelY,tw,16);ctx.fillStyle='#b0fff1';ctx.fillText(title,x+5,labelY+11.5);
      if(index<6){ctx.fillStyle='rgba(176,255,241,.8)';ctx.fillRect(x+w-2,y+h-2,4,4);}
    }); ctx.restore();
  }
  function drawReticle() {
    const w=stageWidth,h=stageHeight,cx=w*.5,cy=h*.47,r=Math.max(13,Math.min(w,h)*.035);
    ctx.save();ctx.strokeStyle='rgba(102,231,237,.42)';ctx.lineWidth=.8;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();line(cx-r-10,cy,cx-r-3,cy,'rgba(176,255,241,.7)',1);line(cx+r+3,cy,cx+r+10,cy,'rgba(176,255,241,.7)',1);line(cx,cy-r-10,cx,cy-r-3,'rgba(176,255,241,.7)',1);line(cx,cy+r+3,cx,cy+r+10,'rgba(176,255,241,.7)',1);
    ctx.restore();
  }
  function drawHudLabels() {
    const w=stageWidth,h=stageHeight;ctx.save();ctx.font='600 8px Rajdhani, sans-serif';ctx.fillStyle='rgba(176,255,241,.6)';
    ctx.textAlign='left';ctx.fillText('JRV / OPTICS',22,48);ctx.fillText(state.aiOn?'ANALYSIS ACTIVE':'ANALYSIS STANDBY',22,60);
    ctx.textAlign='right';ctx.fillText(`TRACKS ${String(state.lastDetections.length).padStart(2,'0')}`,w-22,48);ctx.fillText(state.gridOn?'GRID / ON':'GRID / OFF',w-22,60);
    if(state.cameraOn&&els.video.videoWidth){const map=videoTransform();ctx.textAlign='left';ctx.fillStyle='rgba(176,255,241,.7)';ctx.fillText(`${els.video.videoWidth} × ${els.video.videoHeight}`,22,h*.15);}
    ctx.restore();
  }
  function drawOverlay(now) {
    try {
      resizeCanvas();ctx.clearRect(0,0,stageWidth,stageHeight);
      if(state.hudOn){
        if(state.gridOn) drawGrid(); if(state.roadOn) drawRoadGuide(); drawReticle(); drawDetections(); drawHudLabels();
        // Edge marks and subtle HUD ticks, no fake depth measurements.
        ctx.save();ctx.strokeStyle='rgba(102,231,237,.42)';ctx.lineWidth=.7;
        const cx=stageWidth/2,cy=stageHeight*.55;for(let i=0;i<9;i++){const y=cy+i*i*1.3;line(12,y, i%2?20:16,y,'rgba(102,231,237,.42)',.7);line(stageWidth-12,y,stageWidth-(i%2?20:16),y,'rgba(102,231,237,.42)',.7);}ctx.restore();
      } else if(state.roadOn) drawRoadGuide();
      if(state.cameraOn){state.frameSamples++;if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frameSamples*1000/(now-state.lastFpsAt));state.frameSamples=0;state.lastFpsAt=now;}safeText(els.fpsLabel,`FPS ${state.fps}`);} else safeText(els.fpsLabel,'FPS --');
    } catch(err){ if(!state.drawErrorShown){state.drawErrorShown=true;console.warn('HUD drawing recovered from an error',err);} }
    state.animationId=requestAnimationFrame(drawOverlay);
  }

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && document.visibilityState==='visible') state.wakeLock=await navigator.wakeLock.request('screen'); } catch (_) { state.wakeLock=null; }
  }
  async function releaseWakeLock() { if(state.wakeLock){try{await state.wakeLock.release();}catch(_){}state.wakeLock=null;} }
  function stopTracks() { if(state.stream){state.stream.getTracks().forEach(track=>{try{track.stop();}catch(_){}});state.stream=null;} els.video.srcObject=null; }
  async function startCamera() {
    if(state.cameraOn){stopCamera();return;}
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Camera API unavailable. Open the hosted PWA over HTTPS in a supported browser.',5000);setMessage('Camera access requires HTTPS or localhost and a compatible browser.');return;}
    state.stoppedByUser=false;els.cameraBtn.disabled=true;safeText(els.cameraBtn.querySelector('strong'),'Starting sensor…');setMessage('Requesting camera permission. Approve the browser prompt to continue.');
    const primary={audio:false,video:{facingMode:{ideal:state.facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}};
    try {
      let stream;
      try { stream=await navigator.mediaDevices.getUserMedia(primary); }
      catch(firstErr){ if(firstErr.name==='NotAllowedError'||firstErr.name==='SecurityError') throw firstErr; stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true}); }
      if(state.stoppedByUser){stream.getTracks().forEach(t=>t.stop());return;}
      state.stream=stream;els.video.srcObject=stream;els.video.muted=true;els.video.setAttribute('playsinline','');
      await new Promise((resolve,reject)=>{let timer=setTimeout(()=>reject(new Error('Camera stream did not become ready.')),9000);const done=()=>{clearTimeout(timer);els.video.removeEventListener('loadedmetadata',done);resolve();};els.video.addEventListener('loadedmetadata',done,{once:true});if(els.video.readyState>=1)done();});
      await els.video.play(); state.cameraOn=true;els.video.classList.add('active');els.empty.classList.add('hidden');
      setButtonEnabled(els.aiBtn,true);setButtonEnabled(els.switchBtn,true);setButtonEnabled(els.roadBtn,true);setButtonEnabled(els.torchBtn,true);setButtonEnabled(els.captureBtn,true);
      safeText(els.viewResolution,`RESOLUTION // ${els.video.videoWidth}×${els.video.videoHeight}`);setMessage('Camera active. Video is processed in this browser and is not uploaded by this app.');updateSystemState();await requestWakeLock();toast('Optical sensor active.');
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(state.cameraOn)stopCamera(true);});
      if('MediaStreamTrackEvent' in window) {};
    } catch(err){
      stopTracks();state.cameraOn=false;els.video.classList.remove('active');els.empty.classList.remove('hidden');
      let msg='Camera could not start. Check browser permission and try again.';
      if(err.name==='NotAllowedError'||err.name==='SecurityError')msg='Camera permission was denied. Allow camera access in browser site settings.';
      else if(err.name==='NotFoundError')msg='No compatible camera was found on this device.';
      else if(err.name==='NotReadableError'||err.name==='AbortError')msg='Camera may be busy in another app. Close it and try again.';
      else if(/secure|https/i.test(err.message||''))msg='Camera requires an HTTPS hosted page or localhost.';
      console.warn('Camera start failed:',err);setMessage(msg);toast(msg,4500);updateSystemState();
    } finally {els.cameraBtn.disabled=false;}
  }
  async function stopCamera(fromTrack=false) {
    state.stoppedByUser=true;state.cameraOn=false;state.aiOn=false;state.roadOn=false;state.torchOn=false;state.lastDetections=[];stopTracks();els.video.classList.remove('active');els.empty.classList.remove('hidden');
    setButtonEnabled(els.aiBtn,false);setButtonEnabled(els.switchBtn,false);setButtonEnabled(els.roadBtn,false);setButtonEnabled(els.torchBtn,false);setButtonEnabled(els.captureBtn,false);await releaseWakeLock();
    if(fromTrack)toast('Camera connection ended.'); else toast('Camera stopped.');setMessage('Camera stopped. No camera stream is active.');safeText(els.objectCount,'00');safeText(els.objectSummary,'No detections');safeText(els.inferenceTime,'—');updateSystemState();
  }
  async function switchCamera() {
    if(!state.cameraOn)return;const wasAi=state.aiOn;const next=state.facing==='environment'?'user':'environment';
    await stopTracks();state.cameraOn=false;state.aiOn=false;state.lastDetections=[];state.facing=next;els.video.classList.remove('active');els.empty.classList.remove('hidden');
    // Preserve detector in memory; turn camera back on after the old stream has been released.
    await startCamera();if(state.cameraOn&&wasAi)await toggleAI(true);
  }

  async function loadDetector() {
    if(state.detector)return state.detector;if(state.detectorPromise)return state.detectorPromise;
    state.loadedModelLabel='LOADING MODEL';updateSystemState();setMessage('Downloading the lightweight object detector. First load requires an internet connection.');
    state.detectorPromise=(async()=>{
      const visionUrl='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
      const {FilesetResolver,ObjectDetector}=await import(visionUrl);
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
      const model='https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
      const detector=await ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:model},runningMode:'VIDEO',scoreThreshold:.42,maxResults:8});
      state.detector=detector;state.loadedModelLabel='READY';updateSystemState();setMessage('AI model loaded. Detection runs on-device; recognized classes depend on the model.');return detector;
    })();
    try{return await state.detectorPromise;}catch(err){state.loadedModelLabel='LOAD FAILED';console.error('Detector load failed:',err);throw err;}finally{state.detectorPromise=null;updateSystemState();}
  }
  async function toggleAI(force) {
    const target=typeof force==='boolean'?force:!state.aiOn;
    if(!state.cameraOn){toast('Start the camera before enabling AI detection.');return;}
    if(!target){state.aiOn=false;state.lastDetections=[];safeText(els.objectCount,'00');safeText(els.objectSummary,'Detection paused');safeText(els.inferenceTime,'—');updateSystemState();setMessage('Object detection paused.');return;}
    if(state.aiOn)return;els.aiBtn.disabled=true;safeText(els.aiBtn.querySelector('strong'),'Loading AI…');
    try { await loadDetector(); if(!state.cameraOn)return;state.aiOn=true;state.lastDetectAt=0;updateSystemState();setMessage('AI detection active. Objects are outlined when recognized.');toast('On-device AI detection active.'); }
    catch(err){state.aiOn=false;state.loadedModelLabel='LOAD FAILED';updateSystemState();const msg='AI model could not load. Check internet and try again; the camera HUD can still run without AI.';setMessage(msg);toast(msg,5000);}
    finally{els.aiBtn.disabled=!state.cameraOn;safeText(els.aiBtn.querySelector('strong'),'AI detection');}
  }
  function runDetection(now) {
    const detectionInterval = Number(navigator.deviceMemory || 4) <= 4 ? 720 : 460;
    if(!state.aiOn||!state.detector||!state.cameraOn||els.video.readyState<2||now-state.lastDetectAt<detectionInterval)return;
    state.lastDetectAt=now;const started=performance.now();
    try {
      const result=state.detector.detectForVideo(els.video,now);
      state.lastDetections=Array.isArray(result.detections)?result.detections:[];
      state.lastDetectDuration=Math.round(performance.now()-started);
      safeText(els.objectCount,String(state.lastDetections.length).padStart(2,'0'));safeText(els.inferenceTime,`${state.lastDetectDuration}`);
      const summary=state.lastDetections.slice(0,2).map(d=>d.categories?.[0]?.categoryName||'object').join(', ');
      safeText(els.objectSummary,state.lastDetections.length?summary+(state.lastDetections.length>2?` +${state.lastDetections.length-2}`:''):'No objects detected');
    } catch(err){console.warn('Detection frame skipped:',err);}
  }
  function loop(now) { runDetection(now); state.animationId=requestAnimationFrame(loop); }
  async function toggleTorch() {
    if(!state.cameraOn||!state.stream)return;const track=state.stream.getVideoTracks()[0];if(!track)return;
    try { const caps=track.getCapabilities?track.getCapabilities():{};if(!('torch' in caps)){toast('Flashlight control is not supported by this browser or camera.');return;}await track.applyConstraints({advanced:[{torch:!state.torchOn}]});state.torchOn=!state.torchOn;updateSystemState();toast(state.torchOn?'Flashlight enabled.':'Flashlight disabled.'); }
    catch(err){console.warn(err);toast('Flashlight could not be toggled on this device.');}
  }
  function captureFrame() {
    if(!state.cameraOn||!els.video.videoWidth){toast('Start the camera before capturing a frame.');return;}
    try {
      const out=els.captureCanvas;const w=els.stage.clientWidth,h=els.stage.clientHeight;out.width=Math.round(w);out.height=Math.round(h);const c=out.getContext('2d');
      c.fillStyle='#03080d';c.fillRect(0,0,w,h);
      const vw=els.video.videoWidth,vh=els.video.videoHeight,scale=Math.max(w/vw,h/vh),sw=w/scale,sh=h/scale,sx=(vw-sw)/2,sy=(vh-sh)/2;
      if(state.facing==='user'){c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(els.video,sx,sy,sw,sh,0,0,w,h);c.restore();}else c.drawImage(els.video,sx,sy,sw,sh,0,0,w,h);
      c.drawImage(els.canvas,0,0,els.canvas.width,els.canvas.height,0,0,w,h);
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');const a=document.createElement('a');a.href=out.toDataURL('image/jpeg',.91);a.download=`JARVIS-scan-${stamp}.jpg`;document.body.appendChild(a);a.click();a.remove();toast('Capture prepared. Check your downloads or photos.');
    } catch(err){console.error(err);toast('Capture failed. The browser may block image export.');}
  }
  function handleVoiceCommand(rawTranscript) {
    const text = String(rawTranscript || '').toLowerCase().trim();
    if (!text) { toast('No command heard. Try again.'); return; }
    toast(`Command: ${text}`, 2600);
    setMessage(`Voice command received: ${text}`);
    if (/\b(camera|sensor)\b.*\b(start|on|activate|chalu|shuru)\b|\b(start|activate)\s+(the\s+)?camera\b/.test(text)) { if (!state.cameraOn) void startCamera(); return; }
    if (/\b(camera|sensor)\b.*\b(stop|off|band)\b|\bstop\s+(the\s+)?camera\b/.test(text)) { if (state.cameraOn) void stopCamera(); return; }
    if (/\b(switch|change)\s+(the\s+)?camera\b|\bfront camera\b|\brear camera\b/.test(text)) { if (state.cameraOn) void switchCamera(); else toast('Start the camera before switching.'); return; }
    if (/\b(ai|detection|scanner)\b.*\b(on|start|enable|scan)\b|\bstart\s+(object\s+)?detection\b/.test(text)) { void toggleAI(true); return; }
    if (/\b(ai|detection|scanner)\b.*\b(off|stop|disable)\b|\bstop\s+detection\b/.test(text)) { void toggleAI(false); return; }
    if (/\b(grid)\b.*\b(on|show|enable)\b/.test(text)) { state.gridOn=true;updateSystemState();return; }
    if (/\b(grid)\b.*\b(off|hide|disable)\b/.test(text)) { state.gridOn=false;updateSystemState();return; }
    if (/\b(road guide)\b.*\b(on|show|enable)\b/.test(text)) { state.roadOn=true;updateSystemState();return; }
    if (/\b(road guide)\b.*\b(off|hide|disable)\b/.test(text)) { state.roadOn=false;updateSystemState();return; }
    if (/\b(capture|photo|picture|screenshot)\b/.test(text)) { captureFrame();return; }
    if (/\b(fullscreen|full screen|immersive)\b/.test(text)) { toggleFullscreen();return; }
    if (/\b(hud)\b.*\b(off|hide|disable)\b/.test(text)) { state.hudOn=false;updateSystemState();return; }
    if (/\b(hud)\b.*\b(on|show|enable)\b/.test(text)) { state.hudOn=true;updateSystemState();return; }
    toast('Command not recognized. Try “start camera”, “AI on”, “grid off” or “capture”.', 4500);
  }
  function toggleVoiceCommands() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { toast('Speech recognition is unavailable in this browser. Try Chrome on Android.', 4500);return; }
    if (state.voiceListening && state.voiceRecognition) { try { state.voiceRecognition.stop(); } catch (_) {} return; }
    try {
      const recognition = new Recognition(); state.voiceRecognition = recognition;
      recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 2; recognition.continuous = false;
      recognition.onstart = () => { state.voiceListening = true;updateSystemState();setMessage('Listening for one voice command.');toast('Listening… say a short command.'); };
      recognition.onresult = (event) => { const transcript = event.results?.[0]?.[0]?.transcript || '';handleVoiceCommand(transcript); };
      recognition.onerror = (event) => { const msg = event.error === 'not-allowed' ? 'Microphone permission was denied.' : event.error === 'no-speech' ? 'No speech was detected. Try again.' : 'Voice command failed in this browser.';setMessage(msg);toast(msg,4000); };
      recognition.onend = () => { state.voiceListening = false;state.voiceRecognition = null;updateSystemState(); };
      recognition.start();
    } catch (err) { state.voiceListening = false;state.voiceRecognition = null;updateSystemState();toast('Voice recognition could not start.'); }
  }
  function updateBattery() {
    if(!navigator.getBattery){safeText(els.batteryValue,'N/A');safeText(els.batterySub,'not exposed by browser');return;}
    navigator.getBattery().then(b=>{const update=()=>{safeText(els.batteryValue,`${Math.round(b.level*100)}%`);safeText(els.batterySub,b.charging?'charging':'battery level');};update();b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update);}).catch(()=>{safeText(els.batteryValue,'N/A');});
  }
  function updateTime() {const t=clockText();safeText(els.viewClock,t);safeText(els.diagTime,t);}
  function updateNetwork() {const online=navigator.onLine;safeText(els.diagNetwork,online?'ONLINE':'OFFLINE');els.diagNetwork.style.color=online?'var(--cyan)':'var(--amber)';if(!online&&state.aiOn)setMessage('Offline mode: the current model may continue if its assets are cached.');}
  function installPWA() {
    if(state.installPrompt){state.installPrompt.prompt();state.installPrompt.userChoice.then(choice=>{if(choice.outcome==='accepted')toast('J.A.R.V.I.S installation accepted.');state.installPrompt=null;els.installBtn.disabled=true;safeText(els.installBtn,'Requested');}).catch(()=>{});return;}
    const isApple=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
    if(isApple){toast('On Safari use Share → Add to Home Screen.',5000);safeText($('installHelp'),'iPhone / iPad: Share → Add to Home Screen.');}
    else if(window.matchMedia('(display-mode: standalone)').matches){toast('J.A.R.V.I.S is already running as an installed app.');}
    else {toast('If install is unavailable use Chrome menu ⋮ → Install app or Add to Home screen.',5000);safeText($('installHelp'),'Open in Chrome → menu ⋮ → Install app / Add to Home screen.');}
  }
  function toggleFullscreen() {
    if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});els.appShell.classList.remove('immersive');return;}
    const target=els.appShell;
    if(target.requestFullscreen){target.requestFullscreen().then(()=>target.classList.add('immersive')).catch(()=>{toast('Full screen is not available.');});}
    else {target.classList.toggle('immersive');toast('Immersive layout toggled.');}
  }
  function toggleGrid(){state.gridOn=!state.gridOn;updateSystemState();toast(state.gridOn?'Spatial reference grid enabled.':'Spatial reference grid hidden.');}
  function toggleHud(){state.hudOn=!state.hudOn;updateSystemState();toast(state.hudOn?'HUD overlay enabled.':'HUD overlay hidden.');}
  function toggleRoad(){state.roadOn=!state.roadOn;updateSystemState();toast(state.roadOn?'Perspective road guide enabled. This is not AI road recognition.':'Road guide hidden.');setMessage(state.roadOn?'Road guide is a perspective reference overlay. It is not generated from measured road geometry.':'Road guide disabled.');}
  function bindEvents() {
    els.cameraBtn.addEventListener('click',()=>{void startCamera();});
    els.aiBtn.addEventListener('click',()=>{void toggleAI();});
    els.switchBtn.addEventListener('click',()=>{void switchCamera();});
    els.roadBtn.addEventListener('click',toggleRoad);els.gridBtn.addEventListener('click',toggleGrid);els.hudBtn.addEventListener('click',toggleHud);
    els.torchBtn.addEventListener('click',()=>{void toggleTorch();});els.captureBtn.addEventListener('click',captureFrame);
    els.voiceBtn.addEventListener('click',()=>announce(state.cameraOn?(state.aiOn?'Optical sensor active. On device object detection running.':'Optical sensor active. AI detection is on standby.'):'J A R V I S is in standby. Start the camera to begin.'));
    els.voiceCommandBtn.addEventListener('click',toggleVoiceCommands);
    els.fullscreenBtn.addEventListener('click',toggleFullscreen);els.installBtn.addEventListener('click',installPWA);
    window.addEventListener('resize',resizeCanvas,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(resizeCanvas,220));window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.cameraOn)requestWakeLock();else if(document.visibilityState==='hidden')releaseWakeLock();});
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)els.appShell.classList.remove('immersive');setTimeout(resizeCanvas,120);});
    window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();state.installPrompt=event;els.installBtn.disabled=false;safeText(els.installBtn,'Install');safeText($('installHelp'),'Your browser reports that this PWA can be installed.');});
    window.addEventListener('appinstalled',()=>{state.installPrompt=null;safeText(els.installBtn,'Installed');els.installBtn.disabled=true;toast('J.A.R.V.I.S installed.');});
    window.addEventListener('pagehide',()=>{if(state.animationId)cancelAnimationFrame(state.animationId);stopTracks();releaseWakeLock();if(state.voiceRecognition){try{state.voiceRecognition.abort();}catch(_){}}});
  }
  async function registerServiceWorker() {
    if(!('serviceWorker' in navigator)) {safeText($('installHelp'),'This browser does not support service workers.');return;}
    try {const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)toast('J.A.R.V.I.S update ready. Reopen to use it.');});});}
    catch(err){console.warn('Service worker registration failed:',err);}
  }
  function init() {
    updateTime();updateNetwork();updateBattery();resizeCanvas();updateSystemState();bindEvents();
    state.animationId=requestAnimationFrame(loop);
    setInterval(updateTime,1000);
    if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')setMessage('Host this project over HTTPS for camera access and PWA installation.');
    void registerServiceWorker();
  }
  init();
})();
