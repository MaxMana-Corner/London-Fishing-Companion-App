# Creel — the app

This directory is the deployable app. It ships as static files: there is no
build step at serve time and `app.js` is committed.

Everything about how it works, how to build it and how to change it safely is
in **[../docs/DEV-MANUAL.md](../docs/DEV-MANUAL.md)**.

How to *use* the app is in **[../docs/USER-MANUAL.md](../docs/USER-MANUAL.md)**.

```bash
npm install
npm run build      # app.js + standalone/Creel.html
npm test           # 48 suites, 1,943 assertions
```

Run the seven static checks before the suites — they take seconds and catch the
two bug classes that take the whole app down:

```bash
node tools/scope-check.mjs   # a name read with nothing in scope
node tools/tdz-check.mjs     # a hook depending on something declared below it
node tools/props-check.mjs   # a prop passed and not accepted, or the reverse
node tools/dead-code.mjs     # a component never rendered, a branch never reached
node tools/dead-css.mjs      # a class styled and never reachable from any className
node tools/result-check.mjs  # an { ok } result nobody checks
node tools/icon-contrast.mjs # an icon under 3:1 against its own fill
```

Four things to know before you touch anything:

- **Bump `CACHE` in `sw.js` on every ship**, or installed phones keep the old
  bundle.
- **`app.js` and `standalone/Creel.html` are committed build outputs.** Run the
  build before committing source changes.
- **Never rename `APP_ID` or the `lfc:` storage prefix.** They are wire format
  and storage identifiers, not names. The reason is written above the constant
  in `src/portability.js`.
- **This app's most common bug is code that knows about exactly two of
  something.** Two provinces, two licence lengths, two encyclopedia screens.
  Each one was correct until there were three. Before adding a province, a
  city or a category, grep for the existing ones as literals — in `tests/` as
  well as `src/`.
