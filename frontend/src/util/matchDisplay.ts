import type { GameSnapshot } from "../nakama/protocol";

/** Label for a seat: Nakama username, else short id, else placeholder. */
export function seatDisplayName(s: GameSnapshot, seat: 0 | 1): string {
  const un = s.seat_usernames?.[seat]?.trim();
  if (un) return un;
  const id = s.seat_user_ids[seat];
  if (id) return `Player ${id.slice(0, 8)}`;
  return "—";
}

export function matchHeadline(s: GameSnapshot): string {
  return `${seatDisplayName(s, 0)} vs ${seatDisplayName(s, 1)}`;
}
