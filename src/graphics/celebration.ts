import type { ScreenRect } from './mobile-layout';

/** Original finite paper-light bloom, independent of level recipes and gameplay geometry. */
export function celebrationParticles(fraction: number, rect: ScreenRect) {
  const t = Math.max(0, Math.min(1, fraction));
  return Array.from({ length: 20 }, (_, index) => {
    const angle = index * 2.3999632297;
    const reach = Math.min(rect.width * .43, 138) * (0.5 + (index % 5) / 8);
    const radius = reach * (1 - (1 - t) ** 3);
    return { x: rect.x + rect.width / 2 + Math.cos(angle) * radius,
      y: rect.y + rect.height * .29 + Math.sin(angle) * radius * .7 + t * t * 32,
      radius: 1.6 + index % 3, alpha: (1 - t) ** 1.5, color: index % 4 };
  });
}
