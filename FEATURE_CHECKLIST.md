# J.A.R.V.I.S v2 feature checklist

## Implemented in source (must still be tested on the phone)
- [x] Standalone installable PWA shell
- [x] Mobile responsive Iron Man-inspired HUD
- [x] Live camera with start/stop and permissions
- [x] Front/rear camera switching
- [x] Actual MediaPipe EfficientDet Lite0 object inference
- [x] Object labels and confidence values
- [x] Heuristic label-aware tracking IDs between detections
- [x] Actual SegFormer semantic road segmentation mask
- [x] Perspective grid overlay (visual overlay, not depth mapping)
- [x] Screenshot capture with current overlays
- [x] Voice output with available browser voices and user selection
- [x] Best-effort selection of a likely male-sounding voice when exposed by the device
- [x] Voice command recognition with feature detection and clear unsupported message
- [x] Commands for camera, AI, road AI, grid, HUD, capture, status, torch and standby
- [x] Torch control only when supported by the camera track
- [x] Confidence threshold setting
- [x] Detection interval setting
- [x] Clock, detection count, measured inference time and recent console logs
- [x] Recoverable model-load errors and retry controls
- [x] Service worker shell cache and icon assets
- [x] Object model Cache API attempt; Transformers.js browser caching enabled

## Device/browser dependent
- [ ] Camera permissions accepted by user
- [ ] Torch capability exposed by the browser
- [ ] Speech recognition support and language pack
- [ ] Install prompt offered (browser decides when it is eligible)
- [ ] Model download/storage allowed by browser
- [ ] Acceptable object inference speed on Vivo Y21A
- [ ] Acceptable road segmentation speed on Vivo Y21A
- [ ] Road class found in each particular camera scene

## Not implemented / not promised
- [ ] True 3D environment reconstruction
- [ ] World-locked AR tracking / stable real-world coordinates
- [ ] Guaranteed exact reproduction of the desktop JARVIS Security voice
- [ ] Reliable distance estimation, collision warning or navigation
- [ ] Guaranteed full offline model/runtime loading in every browser
- [ ] Verified crash-free behavior on the user's physical phone
