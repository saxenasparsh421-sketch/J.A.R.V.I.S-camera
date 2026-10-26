# J.A.R.V.I.S feature checklist

## Implemented in source (needs target-device testing)

- [x] Standalone PWA structure; no laptop-side server or JARVIS dependency at runtime
- [x] J.A.R.V.I.S branding and responsive HUD dashboard
- [x] Rear camera activation using an explicit button and browser permission
- [x] Front/rear camera switch
- [x] Stop camera and release media tracks
- [x] Recoverable status messages for denied, missing, busy or failed camera
- [x] Animated HUD grid, reticle and edge marks
- [x] Perspective road-guide overlay (visual aid only; not AI road recognition)
- [x] Optional on-device MediaPipe object detection with labeled bounding boxes and confidence
- [x] Counts, top detected labels and inference timing
- [x] Front-camera detection-box mirroring adjustment
- [x] Flashlight toggle when torch capability is exposed
- [x] Save camera frame plus HUD overlay to JPEG on user request
- [x] Browser speech synthesis for system status where supported
- [x] Optional one-shot voice commands on browsers that support SpeechRecognition
- [x] Fullscreen/immersive mode
- [x] Battery state if browser exposes Battery Status API
- [x] Online/offline state
- [x] PWA manifest, install affordance, app icons and service worker
- [x] App-shell offline cache and best-effort AI asset caching
- [x] Local-only camera processing; no video upload API is present

## Not implemented / not promised

- [ ] True spatial/SLAM tracking or world-locked holograms
- [ ] Actual AI road, lane, sidewalk or drivable-area segmentation
- [ ] Accurate depth measurement or distance estimates
- [ ] Navigation, collision warning or safety functions
- [ ] Guaranteed offline AI until model assets are confirmed cached on the target browser
- [ ] Device-specific crash-free certification; must be tested on the Vivo Y21A

## Suggested safe next iteration after testing

1. Test camera and AI performance on the actual phone and lower the inference rate/resolution if it stutters.
2. Add a lightweight city-scene segmentation model only after verifying its memory footprint on the Vivo Y21A.
3. Investigate marker/world tracking options available in the exact Android browser. Do not claim stable road anchoring until measured on-device.
