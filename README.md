# J.A.R.V.I.S Mobile Vision — PWA v3 CDN-retry build

A clean, standalone, browser-based Android PWA. It does not require Unity, a native APK, a laptop server, or a JARVIS desktop process at runtime.

## What is genuinely implemented

- Rear/front camera selection via `getUserMedia` with permission/error handling.
- Live HUD, perspective grid, snapshot capture, supported-device flashlight control, telemetry and system console.
- Real on-device object detection using MediaPipe Tasks Vision + the official EfficientDet Lite0 model.
- Semantic road-pixel segmentation using Transformers.js + `Xenova/segformer-b0-finetuned-ade-512-512`. It searches the model output for the `road` / `street` class and displays the resulting mask. If no road mask is returned it reports that rather than drawing a fake mask.
- Simple label-aware nearest-centre tracking IDs between successive object detections.
- Speech synthesis status and commands using browser-native Web Speech APIs; available voices are selectable in Settings.
- Service worker for the app shell; object model binary is saved through the Cache API where supported; Transformers.js is configured to use browser/WASM caching and worker-proxied inference where supported.
- Responsive error reporting and retry by tapping the AI controls again.
- CDN fallback: MediaPipe tries jsDelivr then unpkg; Transformers.js tries jsDelivr then esm.sh. A failed import is not permanently cached, so retry can work after network recovery.

## Important update for the CDN error

The screenshot error means the browser failed to download the MediaPipe JavaScript module from jsDelivr. This build tries an alternate CDN and resets a failed import promise so Retry can actually retry. If both CDNs are blocked by the phone network/browser, object AI still cannot load; the app will report that honestly.

## Honest limitations

1. **Road segmentation is not 3D spatial tracking.** It overlays road-class pixels from camera frames. It does not anchor a mesh to a world coordinate system and cannot guarantee stable overlays while the phone moves.
2. **First AI setup requires internet.** The object model is about a few MB. The SegFormer segmentation model can download tens of MB (the model repository lists 27.7 MB in total). Keep Wi-Fi enabled for the first load. Browser storage policies and CDN cache behavior vary, so fully offline AI on every browser is not guaranteed.
3. **Performance varies.** Segmentation runs periodically on a reduced frame and may be slow on the Vivo Y21A. It is not a 30 FPS road detector. If the browser runs out of memory, disable Road AI and reload the page.
4. **Male voice selection is best-effort.** The PWA uses voices exposed by Android/browser speech synthesis. It selects a likely male-sounding English voice when the voice name indicates one, and lets you choose any available voice. A voice used by a local Python/pyttsx3 JARVIS Security app cannot be imported into a PWA automatically; browsers may not expose that exact voice.
5. Voice recognition is not available in every browser. On Chrome Android it may depend on browser/OS support and can require internet. The buttons work independently of speech recognition.
6. Flashlight control depends on browser/device support for the video track's `torch` capability.
7. No web app can be promised crash-free without testing on the target device. The code uses guarded model loading and visible errors, but this package has not been executed on your Vivo Y21A.
8. This is a visual experiment, not a navigation, collision warning, or obstacle-avoidance tool. Do not use it while walking or driving.

## Deploy from your phone with GitHub Pages

1. Download and extract `JARVIS_PWA_V2.zip`.
2. Create a **new public GitHub repository** (for example `JARVIS-mobile-vision-v2`).
3. Upload the *contents* of the extracted folder to the repository root. `index.html` must be visible at the root, not inside an extra nested folder.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose branch `main` and folder `/(root)`, then Save.
7. Open the generated HTTPS Pages URL in Chrome on the Vivo Y21A. Do not open `index.html` as a local file; camera and service workers require HTTPS or localhost.
8. Tap **Start camera** and allow camera access.
9. Tap **Object AI** and wait for the model to load. Then tap **Road AI** if you want road segmentation. Model download progress/status appears on each button and errors are written to Live System Console.
10. In Chrome's menu choose **Install app** or **Add to Home screen**.

GitHub Pages is static hosting. No backend server is required. Changes made to the repository can take a short time to publish.

## Voice commands

Tap **Speak command**, then say one of these in English (or switch recognition language in Settings):

- `Start camera`
- `Stop camera`
- `AI on` / `AI off`
- `Road AI on` / `Road AI off`
- `Switch camera`
- `Grid on` / `Grid off`
- `HUD on` / `HUD off`
- `Capture photo`
- `Flashlight on` / `Flashlight off` (supported devices only)
- `Status report`
- `Stop all`

Voice commands need browser speech recognition support and microphone permission. If unavailable, use the on-screen controls.

## Troubleshooting

- **Camera unavailable:** use the HTTPS Pages URL in Chrome; allow camera permission; close another app using the camera.
- **Object AI fails:** keep internet connected; reload once; retry Object AI; inspect the console message. Its TFLite model is cached when the browser permits it.
- **Road AI fails:** the segmentation library/model is larger. Try Wi-Fi and free browser memory; disable Object AI during the first road-model load if the phone is under load.
- **No road mask:** point the camera toward a clearly visible road surface. ADE20K segmentation is not purpose-trained for road safety and can mislabel surfaces.
- **Voice sounds wrong:** open Settings and choose a different installed voice. The exact voice of a desktop `pyttsx3` installation is not automatically available to the browser.
- **Install option is missing:** use Chrome menu → Install app / Add to Home screen. The site must be served over HTTPS.

## Model sources

- MediaPipe Object Detector web API and official EfficientDet Lite0 model: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
- Transformers.js SegFormer ADE20K model: https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512
- GitHub Pages publishing instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

All camera frames used for inference are passed to the browser-side models; this code does not upload camera frames to a custom server.
