# Dense v2 research lab

This is an explicitly non-production feasibility entry. It is not in the shipping
Vite build, Android web assets, campaign menu, level-number mapping or any save store.

From the repository root:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173/research/dense-v2/**. Lab controls offer A/B families,
uint32 seeds, an optional explicit path count, Challenge/Zen, restart, metrics and
a Canvas motion QA override. Generation uses a Worker; failed requests show a real
failure instead of a partial board. Closing/reloading discards research play.

Representative requests: A/seed 0/automatic = 44 paths; B/seed 0/automatic = 66;
B/seed 0/requested 85 = 85. B/seed 1/requested 85 is a deterministic budget failure.
Blank requested count uses the recipe's seeded target range.

Pinch/wheel to zoom, drag to pan, magnifier to enlarge, reset to fit. Arrow keys
select active paths; Enter extracts. Only real engine moves affect hearts and
removals. Close distinct contacts magnify without an attempt. Use working zoom
on small screens; the existing heuristic has documented intention limits.

The separate production preview is **http://127.0.0.1:4173/** (`npm run preview`
after `npm run build`). The lab link uses that port so testing does not silently
switch the user's existing preview-origin save to a different dev origin.

See `docs/DENSE_V2_FEASIBILITY_HANDOFF.md` and
`docs/DENSE_V2_CANDIDATE_COMPARISON.md` for measured results and REVISE decisions.

Phase 4.7 adds shared tap/hold recognition, a truthful lane ruler, distance-based
snake extraction, progressive fading dots and original optional Web Audio.
A short tap attempts; holding 220 ms previews; releasing a hold only dismisses.
Keyboard: arrows select, P toggles preview, Escape dismisses, Enter/Space attempts.
The selector also offers the unchanged seven-path v1 Level 11 for motion QA.

Sound/haptics initially read the compatible settings on this origin; lab checkbox
changes are session-only. No settings or progress writes occur. Effective motion
is stored reduced-motion OR OS preference, with an explicitly labelled lab-only
full-motion override. Diagnostics explain which preferences are active. Production
never bypasses system reduced motion. For comparable animation capture, explicitly
enable the lab override, use a readable working zoom, then reset/restart for the
same path. See `docs/PHASE_04_7_HANDOFF.md` for actual frame evidence and limitations.
