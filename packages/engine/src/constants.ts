/** The simulation always advances in fixed steps of 1/60 of a second. */
export const TICKS_PER_SECOND = 60;

/**
 * Distances are whole numbers: one cell is 6000 units. Train speeds are then whole units
 * per tick, so movement uses integer math only and gives the same result on every machine.
 * 6000 units / 60 ticks = 100, so "units per tick" = "cells per second x 100".
 */
export const UNITS_PER_CELL = 6000;

/** The 3-2-1 countdown before the clock starts. */
export const COUNTDOWN_SECONDS = 3;
export const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * TICKS_PER_SECOND;

/** A new train only leaves the tunnel once the previous one has travelled 1.25 cells. */
export const SPAWN_GAP_UNITS = (UNITS_PER_CELL * 5) / 4;

/** The next train always comes within 3 seconds. */
export const MAX_SPAWN_TICKS = 3 * TICKS_PER_SECOND;

/** The last seconds of a round, when the UI shows a warning and plays a tick sound. */
export const LOW_TIME_SECONDS = 10;

export const MAX_LEVEL = 20;

/** A level is cleared with at least this many arrivals... */
export const MIN_ARRIVALS_TO_CLEAR = 5;
/** ...and at least this percentage of them correct. */
export const CLEAR_ACCURACY_PERCENT = 80;

/** A correct arrival earns BASE_POINTS + STREAK_BONUS x min(streak - 1, MAX_STREAK_STEPS). */
export const BASE_POINTS = 100;
export const STREAK_BONUS = 10;
export const MAX_STREAK_STEPS = 10;
