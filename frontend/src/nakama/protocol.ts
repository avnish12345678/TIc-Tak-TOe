/** Must match server `nakama/src/constants.ts` */
export const OpCode = {
  MoveIntent: 1,
  StateSnapshot: 2,
  Error: 3,
  PlayAgainRequest: 4,
  RematchPrompt: 5,
  PlayAgainAnswer: 6,
  RematchDeclined: 7,
} as const;

export type GamePhase = "waiting" | "playing" | "finished";

export type GameSnapshot = {
  board: number[];
  phase: GamePhase;
  current_turn_seat: 0 | 1 | null;
  seat_user_ids: (string | null)[];
  /** Display names from Nakama presences (same order as seats 0 and 1). */
  seat_usernames?: (string | null)[];
  winner_seat: 0 | 1 | null;
  draw: boolean;
  move_deadline_ms: number | null;
  timed: boolean;
  /** 4-digit code for private rooms (null for matchmaker-only matches). */
  room_code?: string | null;
  /** True when the opponent is the built-in bot. */
  vs_bot?: boolean;
};

export type ServerErrorPayload = { code: string; detail?: string };

export type RematchPromptPayload = { requester_user_id: string; requester_name: string };

export type RematchDeclinedPayload = {
  decliner_name: string;
  decliner_user_id?: string;
  /** declined | left (opponent left during pending rematch) */
  reason?: string;
};
