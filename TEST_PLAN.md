# Device acceptance test

Run after publishing over HTTPS on the Vivo Y21A.

1. Open the site in Chrome; confirm the shell loads with no console error.
2. Tap Start camera; accept permission. Confirm a live picture and dimensions appear.
3. Tap Switch camera twice. Confirm rear/front changes where the device exposes both cameras.
4. Tap Object AI with internet on. Wait for `Model ready` / `Detecting on-device`; point the phone at a book, bottle, chair or person. Check label boxes and confidence.
5. Tap Road AI with internet on. Wait for model load. Point at a clear road outdoors while stationary. Confirm `ROAD FOUND` only when the model outputs a road mask. `NO ROAD` is a valid result when the model does not find road pixels.
6. Try Grid/HUD toggles and Capture. Confirm PNG appears in Downloads.
7. Try Speak status and Test voice. In Settings choose another installed voice if needed.
8. Tap Speak command and say `AI off`, then `AI on`. If recognition is unsupported, use buttons and record that limitation.
9. Try Flashlight only if its control is enabled.
10. Close and reopen the installed PWA once. The app shell should load from cache; verify whether model assets also work offline (browser-dependent).
11. If the tab reloads or crashes on Road AI, disable Road AI and repeat; record the browser and whether free storage/memory is available.

Do not use road segmentation as a driving or walking aid.
