// Board / level constants for the voxel grid.

export const COLS = 13;
export const ROWS = 13;

// Row 0 = HOME (far edge) ... Row 12 = bottom start grass (near edge).
export const HOME_ROW = 0;
export const MEDIUM_ROW = 6; // median safe stripe
export const START_ROW = 11;
export const START_COL = 6;

export const WATER_ROWS: readonly number[] = [1, 2];
export const ROAD_ROWS: readonly number[] = [3, 4, 5, 7, 8, 9, 10];

// Home pits and trees inside the home row.
export const PIT_COLS: readonly number[] = [1, 3, 5, 7, 9, 11];
export const TREE_COLS: readonly number[] = [0, 2, 4, 6, 8, 10, 12];

export const BOARD_HALF = (COLS - 1) / 2; // 6
export const BOARD_HALF_Z = (ROWS - 1) / 2; // 6

/** world x of a column center */
export const colX = (c: number) => c - BOARD_HALF;
/** world z of a row center */
export const rowZ = (r: number) => r - BOARD_HALF_Z;
/** nearest column index for a world x */
export const xToCol = (x: number) => Math.round(x + BOARD_HALF);

// Feet heights for the different surfaces.
export const SURFACE_Y = 0;
export const LOG_RIDE_Y = 0.64;
export const TURTLE_RIDE_Y = 0.27;

export const HOP_TIME = 0.16; // seconds per grid step
export const HOP_HEIGHT = 0.42;

export const BASE_TIME = 44; // seconds, level 1
export const MIN_TIME = 30;

export type Dir = 'up' | 'down' | 'left' | 'right';

// Voxel frog model is built facing -Z.
export const HOP_YAW: Record<Dir, number> = {
  up: 0,
  down: Math.PI,
  right: -Math.PI / 2,
  left: Math.PI / 2,
};

export const DIR_DELTA: Record<Dir, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export const inRows = (rows: readonly number[], r: number) => rows.includes(r);

export const pad5 = (n: number) => Math.max(0, Math.floor(n)).toString().padStart(5, '0');
