# FLOWLINE

Unwind living lines.

Phase 1 foundation for an original, offline Android arrow-extraction puzzle.
Includes a home screen, a **non-interactive Board Preview**, and locally saved preferences.

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm run typecheck
npm run test
npm run build
npm run android:sync
```

The local development address is http://127.0.0.1:5173.
Use `npm run preview` to serve the production build at http://127.0.0.1:4173.

Android packaging uses Capacitor 8. The application ID `com.example.flowline` is a development placeholder.
See [the Phase 1 handoff](docs/PHASE_01_HANDOFF.md) for verification results and native build requirements.

Gameplay mechanics are reserved for Phase 2 and later, pending approval.
