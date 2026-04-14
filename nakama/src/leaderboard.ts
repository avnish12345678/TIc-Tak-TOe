import { LB_WINS } from "./constants";

export function ensureLeaderboards(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
  try {
    nk.leaderboardCreate(
      LB_WINS,
      true,
      "descending",
      "best",
      null,
      { description: "Tic-Tac-Toe wins" },
      true,
    );
    logger.info("leaderboard created: %s", LB_WINS);
  } catch (e) {
    logger.debug("leaderboard %s already exists or create skipped: %s", LB_WINS, String(e));
  }
}

export function recordWin(nk: nkruntime.Nakama, logger: nkruntime.Logger, winnerUserId: string): void {
  try {
    nk.leaderboardRecordWrite(
      LB_WINS,
      winnerUserId,
      undefined,
      1,
      0,
      {},
      "increment",
    );
  } catch (e) {
    logger.error("leaderboardRecordWrite failed for %s: %s", winnerUserId, String(e));
  }
}
