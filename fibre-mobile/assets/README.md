# Assets

Place the following image files in this directory for the app to build properly:

| File | Size | Description |
|------|------|-------------|
| `icon.png` | 1024x1024px | App icon |
| `splash.png` | 1284x2778px | Splash screen image |
| `adaptive-icon.png` | 1024x1024px | Android adaptive icon |

These are referenced in `app.json`. Until real assets are provided, you can use
placeholder colors or generate them via:

```
npx expo-asset-utils generate
```

Or simply create 1x1 pixel PNG placeholders to unblock development builds.
