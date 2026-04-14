/** System user id for global server storage (Nakama). */
export const SYS_USER = "00000000-0000-0000-0000-000000000000";

export const COLL_ROOM_CODE = "ttt_room_code";
export const COLL_MATCH_CODE = "ttt_match_code";

export function matchKeyFromMatchId(matchId: string): string {
  return matchId.replace(/\./g, "_");
}

export function pickUnusedRoomCode(nk: nkruntime.Nakama): string | null {
  for (let i = 0; i < 120; i++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const objs = nk.storageRead([{ collection: COLL_ROOM_CODE, key: code, userId: SYS_USER }]);
    if (!objs || objs.length === 0) return code;
  }
  return null;
}

export function writeRoomCodeMapping(nk: nkruntime.Nakama, matchId: string, code: string): void {
  const mk = matchKeyFromMatchId(matchId);
  nk.storageWrite([
    {
      collection: COLL_ROOM_CODE,
      key: code,
      userId: SYS_USER,
      value: { match_id: matchId },
      permissionRead: 0,
      permissionWrite: 0,
    },
    {
      collection: COLL_MATCH_CODE,
      key: mk,
      userId: SYS_USER,
      value: { code },
      permissionRead: 0,
      permissionWrite: 0,
    },
  ]);
}

export function releaseRoomCodeMapping(nk: nkruntime.Nakama, matchId: string, roomCode: string): void {
  if (!roomCode) return;
  const mk = matchKeyFromMatchId(matchId);
  nk.storageDelete([
    { collection: COLL_ROOM_CODE, key: roomCode, userId: SYS_USER },
    { collection: COLL_MATCH_CODE, key: mk, userId: SYS_USER },
  ]);
}

export function readCodeForMatch(nk: nkruntime.Nakama, matchId: string): string {
  try {
    const objs = nk.storageRead([
      { collection: COLL_MATCH_CODE, key: matchKeyFromMatchId(matchId), userId: SYS_USER },
    ]);
    if (objs && objs[0] && objs[0].value) {
      const c = objs[0].value["code"];
      if (c !== undefined && c !== null) return String(c);
    }
  } catch {
    // ignore
  }
  return "";
}
