import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { getLevel } = await server.ssrLoadModule('/src/game/levels.ts');
  const { createGameState } = await server.ssrLoadModule('/src/game/state.ts');
  const { getSafeArrowIds } = await server.ssrLoadModule('/src/game/rules.ts');
  const { countTurns } = await server.ssrLoadModule('/src/game/difficulty.ts');
  const { extractionFor, departureDuration } = await server.ssrLoadModule('/src/graphics/animation.ts');
  const { boardTransform } = await server.ssrLoadModule('/src/graphics/viewport.ts');
  const { gameplayLayout } = await server.ssrLoadModule('/src/graphics/mobile-layout.ts');
  const v1 = getLevel(11); if (!v1.ok) throw new Error(v1.message);
  const levels = { 'v1-11': v1.level, A: JSON.parse(await readFile('src/tests/fixtures/dense-v2-r2-a-seed0.json','utf8')).level, B: JSON.parse(await readFile('src/tests/fixtures/dense-v2-r2-b-seed0.json','utf8')).level };
  const samples = [];
  for (const [family,level] of Object.entries(levels)) {
    const safe = getSafeArrowIds(createGameState(level, 'challenge'));
    const transform = boardTransform({ width:390, height:844, columns:level.width, rows:level.height, safe:gameplayLayout(390,844).safe });
    for (const arrow of level.arrows.filter(a=>safe.includes(a.id))) {
      const motion = extractionFor(arrow,transform.toCSS,390,844,transform.cell*.7+8);
      samples.push({ family, id:arrow.id, direction:arrow.direction, turns:countTurns(arrow), cells:arrow.cells, css:arrow.cells.map(transform.toCSS), originalLengthPx:motion.length, travelPx:motion.travel, legacyDurationMs:motion.duration, interactiveDurationMs:departureDuration(arrow.cells.length,motion.travel,transform.cell) });
    }
  }
  await writeFile('docs/verification/phase047/TRAJECTORY_PROBE.json',JSON.stringify(samples,null,2)+'\n');
  console.log(`Measured ${samples.length} initially safe paths from unchanged v1/A/B layouts; full trajectories written to TRAJECTORY_PROBE.json.`);
} finally { await server.close(); }
