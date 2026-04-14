import { MATCH_MODULE } from "./constants";
import { ensureLeaderboards } from "./leaderboard";
import { ticTacToeMatchHandler } from "./match_handler";
import { rpcCreateBotRoom, rpcCreateRoom, rpcLeaderboardTop, rpcListOpenRooms, rpcRoomByCode } from "./rpc_rooms";

function matchmakerTimedFromEntries(entries: nkruntime.MatchmakerResult[]): boolean {
  for (const e of entries) {
    const p = e.properties || {};
    if (p["timed"] === "1" || p["timed"] === "true") return true;
  }
  return false;
}

function onMatchmakerMatched(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[],
): string | void {
  if (!matches || matches.length < 2) {
    logger.warn("matchmaker_matched insufficient players: %d", matches ? matches.length : 0);
    return;
  }
  const timed = matchmakerTimedFromEntries(matches);
  const matchId = nk.matchCreate(MATCH_MODULE, { timed: timed ? "1" : "0" });
  logger.info("matchmaker_matched -> authoritative match=%s timed=%s players=%d", matchId, timed, matches.length);
  return matchId;
}

export function InitModule(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  ensureLeaderboards(nk, logger);

  initializer.registerMatch(MATCH_MODULE, ticTacToeMatchHandler);

  initializer.registerMatchmakerMatched(onMatchmakerMatched);

  initializer.registerRpc("create_bot_room", rpcCreateBotRoom);
  initializer.registerRpc("create_room", rpcCreateRoom);
  initializer.registerRpc("list_open_rooms", rpcListOpenRooms);
  initializer.registerRpc("room_by_code", rpcRoomByCode);
  initializer.registerRpc("leaderboard_top", rpcLeaderboardTop);

  logger.info(
    "InitModule registered match=%s rpcs=create_bot_room,create_room,list_open_rooms,room_by_code,leaderboard_top",
    MATCH_MODULE,
  );
}
