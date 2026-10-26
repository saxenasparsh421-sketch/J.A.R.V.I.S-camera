# J.A.R.V.I.S — Mobile HUD PWA

A standalone, mobile-first Progressive Web App starter for Android. It does not connect to or require the laptop JARVIS program.

## Included in this build

- Iron Man–inspired responsive HUD design
- Rear/front camera switching
- Camera permission/error handling and stream cleanup
- Perspective grid and an explicitly illustrative road-guide overlay
- Optional MediaPipe EfficientDet Lite0 object detection, run in the browser after the user enables it
- Object boxes, labels, confidence scores and inference timing
- Flashlight toggle when the browser/device exposes the torch constraint
- Capture current camera frame with HUD overlay to a JPEG download
- Voice status via the browser's speech synthesis (if available)
- Optional one-shot voice commands for camera, AI, grid, HUD, road guide and capture on browsers that expose SpeechRecognition
- Fullscreen/immersive mode, battery/network status where exposed
- Installable PWA manifest and service worker cache for the app shell
- Runtime caching attempt for AI assets; browsers may evict caches or restrict cross-origin caching

## Important limitations

- This build does **not** perform true 3D reconstruction, depth sensing, navigation, lane detection, or AI road segmentation. The road guide is a perspective graphic only. Don't confuse it with measured road geometry.
- Object detection depends on internet access to download the MediaPipe JavaScript/WASM files and the EfficientDet Lite0 model on first use. The service worker tries to cache these assets, but offline AI is not guaranteed across browsers.
- Detected classes are limited to the model's training labels; it cannot recognize every object.
- This was source-validated but not run on the target Vivo Y21A in a real Android browser. Device-specific camera, Torch, PWA install, model performance, and cache behavior must be tested after hosting.
- Camera access and service workers need a secure origin (HTTPS) or localhost. Opening `index.html` directly from the Files app will not be a reliable test.
- Camera video is not sent to a server by this app; the model/code are fetched from external CDN/model hosts. The app does not record continuously; frame capture is user initiated. Browser speech recognition can rely on an online service depending on the browser/provider; microphone use is started only when you tap Voice commands.
- The road/camera overlay must not be used while driving or walking near traffic. It's a visual experiment, not a safety instrument.

## Publish from your phone using GitHub Pages

1. Create a new public repository on GitHub, for example `JARVIS-Mobile-HUD`.
2. Upload **the contents inside this folder** (not the parent folder) to the repository root. Keep `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`, and `icons/` in their shown locations.
3. On GitHub open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select branch `main`, folder `/ (root)`, then save.
5. Wait for GitHub Pages to publish and open the HTTPS URL shown on the Pages settings screen in Chrome on the Vivo Y21A.
6. Press **Start camera** and allow camera permission. Press **AI detection** while online to download the model the first time. Try the camera/grid first, then AI detection.
7. In Chrome, use **⋮ → Install app** or **Add to Home screen** when available.

For the existing repo, the same files can be placed in a new folder and served with GitHub Pages. Ensure the published URL includes the folder path and that the service worker path remains relative as provided.

## Basic tests after publish

- Open the HTTPS URL; check the Network diagnostic.
- Start the camera; verify the feed and video resolution. Deny then re-allow camera permission to test the recoverable error path.
- Switch front/rear camera and stop camera; confirm camera indicator turns off.
- Toggle grid, HUD, road guide and fullscreen.
- Enable AI detection while online; wait for model load, then test on ordinary objects. The first load may be slow on older phones.
- Capture a frame; verify a JPEG is downloaded.
- Reload while online and offline to test shell caching. Offline model inference works only if all required model assets were successfully cached and the browser retains them.

## Technical references

- MediaPipe web object detector guide: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
- Camera secure-context/permission behavior: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- PWA basics: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
