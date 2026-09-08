# Creel — the app

This directory is the deployable app. It ships as static files: there is no
build step at serve time and `app.js` is committed.

Everything about how it works, how to build it and how to change it safely is
in **[../docs/DEV-MANUAL.md](../docs/DEV-MANUAL.md)**.

How to *use* the app is in **[../docs/USER-MANUAL.md](../docs/USER-MANUAL.md)**.

```bash
npm install
npm run build      # app.js + standalone/Creel.html
npm test           # 18 suites, 817 assertions
```

Three things to know before you touch anything:

- **Bump `CACHE` in `sw.js` on every ship**, or installed phones keep the old
  bundle.
- **`app.js` and `standalone/Creel.html` are committed build outputs.** Run the
  build before committing source changes.
- **Never rename `APP_ID` or the `lfc:` storage prefix.** They are wire format
  and storage identifiers, not names. The reason is written above the constant
  in `src/portability.js`.
