# Task 13 report
Implemented src/ui/grimoire-layout.ts (pure layoutGrimoire), src/ui/GrimoirePanel.tsx (SVG, viewBox zoom [0.5,3], wheel/drag/＋－, hint panel, role=button nodes, fog circle r=100), App.tsx wired, CSS appended. Tests: grimoire-layout.test.ts (6), GrimoirePanel.test.tsx (2).
RED: vitest run of the two new tests failed (modules missing). GREEN: npm test 22 files / 179 tests pass (after final drag fix re-run); npm run build OK.
HUD select kept. Drag-vs-click guarded with a wasDrag ref.
