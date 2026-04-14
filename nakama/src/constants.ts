/** Authoritative match module name (must match registerMatch + matchCreate). */
export const MATCH_MODULE = "tictactoe_auth";

/** Label string used for nk.matchList discovery. */
export const MATCH_LABEL = "tictactoe";

/** Bot practice matches — excluded from `list_open_rooms`. */
export const MATCH_LABEL_BOT = "tictactoe_bot";

export const TICK_RATE = 10;

/** Opcodes (match data). */
export const OpCode = {
  MoveIntent: 1,
  StateSnapshot: 2,
  Error: 3,
  /** Client → server: request a rematch (phase must be finished). */
  PlayAgainRequest: 4,
  /** Server → client (opponent only): show rematch prompt. */
  RematchPrompt: 5,
  /** Client → server: `{ accept: boolean }` answer to pending request. */
  PlayAgainAnswer: 6,
  /** Server → both: rematch declined or match closing; clients return to lobby. */
  RematchDeclined: 7,
} as const;

export const LB_WINS = "tic_tac_toe_wins";

/** Synthetic user id for the built-in bot (never a real Nakama account). */
export const BOT_USER_ID = "00000000-0000-0000-0000-0000000000b0";

export const MOVE_TIMEOUT_MS = 30_000;
export const DISCONNECT_FORFEIT_MS = 120_000;
export const FINISHED_MATCH_TTL_TICKS = 30 * TICK_RATE;
