/** Browser-independent domain contracts. Preview artwork uses its own board layout. */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export type Direction = 'up' | 'right' | 'down' | 'left';

export interface ArrowPath {
  readonly id: string;
  /** Ordered, orthogonally adjacent cells, tail first and head last. */
  readonly cells: readonly [GridPoint, ...GridPoint[]];
  /** Outward heading of the arrowhead. */
  readonly direction: Direction;
  readonly variant?: 'standard';
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Level {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly arrows: readonly ArrowPath[];
  readonly seed?: number;
  readonly difficulty?: Difficulty;
}

export type GameMode = 'challenge' | 'zen';
export type GamePhase = 'ready' | 'animating' | 'won' | 'lost';

/** Read-only snapshots: consumers must not mutate activeArrowIds through a cast. */
export interface GameState {
  readonly mode: GameMode;
  readonly phase: GamePhase;
  readonly level: Level;
  readonly activeArrowIds: ReadonlySet<string>;
  /** Starts at 3 in both modes; Zen preserves this value and does not consume lives. */
  readonly hearts: number;
  /** Actual attempts against an active arrow, including blocked attempts. */
  readonly moves: number;
  readonly mistakes: number;
  readonly pendingArrowId?: string;
}
