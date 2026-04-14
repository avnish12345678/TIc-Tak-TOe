import { LB_WINS, MATCH_LABEL, MATCH_MODULE } from "./constants";
import { COLL_ROOM_CODE, pickUnusedRoomCode, readCodeForMatch, SYS_USER, writeRoomCodeMapping } from "./room_codes";

function parseTimed(payload: string): boolean {
  try {
    const o = JSON.parse(payload || "{}");
    return o.timed === true || o.timed === 1 || o.timed === "1";
  } catch {
    return false;
  }
}

/** Private match vs built-in bot (no room code; not listed in open rooms). */
export function rpcCreateBotRoom(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const timed = parseTimed(payload);
  const matchId = nk.matchCreate(MATCH_MODULE, { timed: timed ? "1" : "0", vs_bot: "1" });
  logger.info("create_bot_room user=%s match=%s timed=%s", ctx.userId, matchId, timed);
  return JSON.stringify({ match_id: matchId, timed, vs_bot: true });
}

export function rpcCreateRoom(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const timed = parseTimed(payload);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = pickUnusedRoomCode(nk);
    if (!code) {
      logger.error("create_room no free room code user=%s", ctx.userId);
      return JSON.stringify({ error: "room_code_pool_busy" });
    }
    const matchId = nk.matchCreate(MATCH_MODULE, { timed: timed ? "1" : "0", room_code: code });
    try {
      writeRoomCodeMapping(nk, matchId, code);
      logger.info("create_room user=%s match=%s code=%s timed=%s", ctx.userId, matchId, code, timed);
      return JSON.stringify({ match_id: matchId, room_code: code, timed });
    } catch (e) {
      logger.warn("create_room storage retry match=%s: %s", matchId, String(e));
    }
  }
  return JSON.stringify({ error: "room_code_write_failed" });
}

export function rpcListOpenRooms(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  let limit = 20;
  try {
    const o = JSON.parse(payload || "{}");
    if (typeof o.limit === "number" && o.limit > 0 && o.limit <= 50) limit = o.limit;
  } catch {
    // ignore
  }
  try {
    const matches = nk.matchList(limit, true, MATCH_LABEL, 1, 1, null) ?? [];
    const rooms = matches.map((m) => ({
      match_id: m.matchId,
      size: m.size,
      label: m.label,
      room_code: readCodeForMatch(nk, m.matchId) || null,
    }));
    logger.debug("list_open_rooms user=%s count=%d", ctx.userId, rooms.length);
    return JSON.stringify({ rooms });
  } catch (e) {
    logger.error("list_open_rooms failed: %s", String(e));
    return JSON.stringify({ rooms: [], error: "match_list_failed" });
  }
}

export function rpcLeaderboardTop(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  let limit = 10;
  try {
    const o = JSON.parse(payload || "{}");
    if (typeof o.limit === "number" && o.limit > 0 && o.limit <= 100) limit = o.limit;
  } catch {
    // ignore
  }
  try {
    const res = nk.leaderboardRecordsList(LB_WINS, [], limit);
    const raw = res.records ?? [];
    const ownerIds = [...new Set(raw.map((r) => r.ownerId).filter((id): id is string => !!id))];
    const users = ownerIds.length > 0 ? nk.usersGetId(ownerIds) ?? [] : [];
    const nameByUserId: { [userId: string]: string } = {};
    for (const u of users) {
      const fromUser =
        (u.displayName && String(u.displayName).trim()) || (u.username && String(u.username).trim()) || "";
      if (fromUser) nameByUserId[u.userId] = fromUser;
    }
    const records = raw.map((r) => {
      const fromRecord = r.username && String(r.username).trim();
      const fromAccount = nameByUserId[r.ownerId] || "";
      return {
        owner_id: r.ownerId,
        username: fromRecord || fromAccount || "",
        score: r.score,
        subscore: r.subscore,
        metadata: r.metadata,
      };
    });
    return JSON.stringify({ records, next_cursor: res.nextCursor });
  } catch (e) {
    logger.error("leaderboard_top failed: %s", String(e));
    return JSON.stringify({ records: [], next_cursor: "" });
  }
}

function normalizeFourDigitCode(payload: string): string | null {
  try {
    const o = JSON.parse(payload || "{}");
    const digits = String(o.code ?? "").replace(/\D/g, "");
    if (digits.length !== 4) return null;
    return digits;
  } catch {
    return null;
  }
}

/** Resolve a 4-digit meeting code to a live match id (created rooms only). */
export function rpcRoomByCode(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const code = normalizeFourDigitCode(payload);
  if (!code) {
    return JSON.stringify({ error: "bad_code", detail: "Enter exactly 4 digits." });
  }
  const objs = nk.storageRead([{ collection: COLL_ROOM_CODE, key: code, userId: SYS_USER }]);
  if (!objs || objs.length === 0 || !objs[0].value || !objs[0].value["match_id"]) {
    return JSON.stringify({ error: "not_found", detail: "No room with that code." });
  }
  const matchId = String(objs[0].value["match_id"]);
  const matches = nk.matchList(30, true, MATCH_LABEL, 1, 2, null) ?? [];
  const live = matches.some((m) => m.matchId === matchId);
  if (!live) {
    return JSON.stringify({ error: "match_ended", detail: "That game is no longer open." });
  }
  logger.debug("room_by_code user=%s code=%s match=%s", ctx.userId, code, matchId);
  return JSON.stringify({ match_id: matchId, room_code: code });
}
