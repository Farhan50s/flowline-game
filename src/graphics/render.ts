import type { ArrowPath, GridPoint } from '../game/types';
import { backingSize, directionVectors, fitGrid } from './geometry';
import type { PreviewArtwork } from './preview';

function drawPath(context: CanvasRenderingContext2D, arrow: ArrowPath, project: (p: GridPoint) => GridPoint, cell: number) {
  const points = arrow.cells.map(project);
  const first = points[0];
  const head = points[points.length - 1];
  if (!first || !head) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) continue;
    const radius = cell * 0.22;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    context.lineTo(current.x - (current.x - previous.x) / incoming * radius, current.y - (current.y - previous.y) / incoming * radius);
    context.quadraticCurveTo(current.x, current.y, current.x + (next.x - current.x) / outgoing * radius, current.y + (next.y - current.y) / outgoing * radius);
  }
  context.lineTo(head.x, head.y);
  context.stroke();
  const vector = directionVectors[arrow.direction];
  const size = cell * 0.28;
  context.beginPath();
  context.moveTo(head.x - vector.x * size - vector.y * size, head.y - vector.y * size + vector.x * size);
  context.lineTo(head.x, head.y);
  context.lineTo(head.x - vector.x * size + vector.y * size, head.y - vector.y * size - vector.x * size);
  context.stroke();
}

/** Passive canvas: draws only on resize/DPR changes, with complete listener cleanup. */
export function mountArtwork(canvas: HTMLCanvasElement, artwork: PreviewArtwork, showGrid: boolean): () => void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A Canvas 2D context is required for the preview.');
  let frame = 0;
  let disposed = false;
  let densityQuery: MediaQueryList | undefined;

  function draw() {
    frame = 0;
    if (disposed || !context) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return; // Hidden screens redraw once ResizeObserver sees them.
    const ratio = window.devicePixelRatio || 1;
    const backing = backingSize(width, height, ratio);
    canvas.width = backing.width;
    canvas.height = backing.height;
    context.setTransform(backing.width / width, 0, 0, backing.height / height, 0, 0);
    context.clearRect(0, 0, width, height);
    const { cell, offsetX, offsetY } = fitGrid(width, height, artwork.columns, artwork.rows);
    const project = ({ x, y }: GridPoint): GridPoint => ({ x: offsetX + x * cell, y: offsetY + y * cell });
    const tokens = getComputedStyle(canvas);
    const ink = tokens.getPropertyValue('--color-ink').trim();
    const accent = tokens.getPropertyValue('--color-accent').trim();
    if (showGrid) {
      context.fillStyle = tokens.getPropertyValue('--color-grid').trim();
      for (let y = 0; y < artwork.rows; y++) {
        for (let x = 0; x < artwork.columns; x++) {
          const point = project({ x, y });
          context.beginPath();
          context.arc(point.x, point.y, Math.max(1, cell * 0.035), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.lineWidth = cell * 0.135;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const arrow of artwork.arrows) {
      context.strokeStyle = artwork.accentIds.includes(arrow.id) ? accent : ink;
      drawPath(context, arrow, project, cell);
    }
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(draw);
  }

  function watchDensity() {
    densityQuery?.removeEventListener('change', watchDensity);
    densityQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener('change', watchDensity);
    schedule();
  }

  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  window.addEventListener('resize', schedule);
  watchDensity();
  return () => {
    disposed = true;
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    densityQuery?.removeEventListener('change', watchDensity);
    cancelAnimationFrame(frame);
  };
}
