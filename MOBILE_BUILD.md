# Mobile Build

This project is now mobile-ready as an installable PWA and prepared for an Android wrapper with Capacitor.

## Fastest Mobile Test

1. Run `npm install`.
2. Run `npm start`.
3. Open the shown local URL on your phone over the same Wi-Fi network.
4. Use the browser menu to install/add the game to the home screen.

The game includes mobile viewport settings, safe-area support, touch controls, landscape preference, offline caching, fullscreen request on start, and vibration feedback on absorbs.

## Android Wrapper

After `npm install`, run:

```powershell
npm run build
npm run cap:sync
npm run cap:open:android
```

Build the APK or AAB from Android Studio. The local machine already has an Android SDK folder, but the Android tools are not currently on PATH, so Android Studio is the most reliable next step.
