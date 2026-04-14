import {
  BOT_USER_ID,
  DISCONNECT_FORFEIT_MS,
  FINISHED_MATCH_TTL_TICKS,
  MATCH_LABEL,
  MATCH_LABEL_BOT,
  MATCH_MODULE,
  MOVE_TIMEOUT_MS,
  OpCode,
  TICK_RATE,
} from "./constants";
import { pickBotMove } from "./bot_logic";
import { applyMove, cellMarkForSeat, checkWinner, emptyBoard, isDraw, type Cell } from "./game_logic";
import { recordWin } from "./leaderboard";
import { releaseRoomCodeMapping } from "./room_codes";

export interface TicMatchState {
  timed: boolean;
  phase: "waiting" | "playing" | "finished";
  board: Cell[];
  seatByUserId: { [userId: string]: 0 | 1 };
  presenceByUserId: { [userId: string]: nkruntime.Presence | null };
  /** From nk.usersGetId — prefer over presence.username (often auto-generated for device users). */
  accountLabelByUserId: { [userId: string]: string };
  disconnectAtMs: { [userId: string]: number };
  currentTurnSeat: 0 | 1;
  winnerSeat: 0 | 1 | null;
  draw: boolean;
  moveDeadlineMs: number;
  emptyTicks: number;
  finishedTicks: number;
  statsWritten: boolean;
  rematchRequestedBy: string | null;
  /** Set from matchLeave when rematch flow should end the match on next tick. */
  pendingTerminate: boolean;
  /** 4-digit meeting code for created rooms (empty for matchmaker games). */
  roomCode: string;
  /** Single-player vs unbeatable bot. */
  vsBot: boolean;
}

function nowMs(): number {
  return Date.now();
}

function seatedUserIds(state: TicMatchState): string[] {
  return Object.keys(state.seatByUserId);
}

function labelFromUser(u: nkruntime.User): string {
  const dn = u.displayName && String(u.displayName).trim();
  const un = u.username && String(u.username).trim();
  return dn || un || "";
}

/** Refresh display labels from account store (display_name beats auto username). */
function syncAccountLabels(nk: nkruntime.Nakama, state: TicMatchState): void {
  const ids = seatedUserIds(state).filter((id) => id !== BOT_USER_ID);
  if (ids.length === 0) return;
  const users = nk.usersGetId(ids) ?? [];
  for (const u of users) {
    const label = labelFromUser(u);
    if (label) state.accountLabelByUserId[u.userId] = label;
  }
}

function buildSnapshot(state: TicMatchState): string {
  const seatUserIds: (string | null)[] = [null, null];
  const seatUsernames: (string | null)[] = [null, null];
  for (const uid of seatedUserIds(state)) {
    const seat = state.seatByUserId[uid]!;
    seatUserIds[seat] = uid;
    const pr = state.presenceByUserId[uid];
    const fromAccount = state.accountLabelByUserId[uid]?.trim() || "";
    const fromPresence = pr && pr.username ? String(pr.username).trim() : "";
    seatUsernames[seat] = fromAccount || fromPresence || null;
  }
  const snap = {
    board: state.board,
    phase: state.phase,
    current_turn_seat: state.phase === "playing" ? state.currentTurnSeat : null,
    seat_user_ids: seatUserIds,
    seat_usernames: seatUsernames,
    winner_seat: state.winnerSeat,
    draw: state.draw,
    move_deadline_ms: state.timed && state.phase === "playing" ? state.moveDeadlineMs : null,
    timed: state.timed,
    room_code: state.roomCode || null,
    vs_bot: state.vsBot,
  };
  return JSON.stringify(snap);
}

function broadcastState(dispatcher: nkruntime.MatchDispatcher, state: TicMatchState): void {
  dispatcher.broadcastMessage(OpCode.StateSnapshot, buildSnapshot(state), null, null, true);
}

function sendError(
  dispatcher: nkruntime.MatchDispatcher,
  sender: nkruntime.Presence,
  code: string,
  detail?: string,
): void {
  dispatcher.broadcastMessage(
    OpCode.Error,
    JSON.stringify({ code, detail: detail ?? "" }),
    [sender],
    null,
    true,
  );
}

function startPlaying(state: TicMatchState): void {
  state.phase = "playing";
  state.board = emptyBoard();
  state.currentTurnSeat = 0;
  state.winnerSeat = null;
  state.draw = false;
  state.moveDeadlineMs = state.timed ? nowMs() + MOVE_TIMEOUT_MS : 0;
}

function finishMatch(
  state: TicMatchState,
  winnerSeat: 0 | 1 | null,
  draw: boolean,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
): void {
  state.phase = "finished";
  state.winnerSeat = winnerSeat;
  state.draw = draw;
  state.moveDeadlineMs = 0;
  if (!state.statsWritten) {
    if (!draw && winnerSeat !== null) {
      const ids = seatedUserIds(state);
      const winnerUserId = ids.find((id) => state.seatByUserId[id] === winnerSeat);
      if (winnerUserId && winnerUserId !== BOT_USER_ID) {
        recordWin(nk, logger, winnerUserId);
      }
    }
    state.statsWritten = true;
  }
}

function userSeat(state: TicMatchState, userId: string): 0 | 1 | null {
  const s = state.seatByUserId[userId];
  return s === undefined ? null : s;
}

function displayNameForSeatUser(
  state: TicMatchState,
  uid: string,
  presence: nkruntime.Presence | null | undefined,
): string {
  const fromAccount = state.accountLabelByUserId[uid]?.trim();
  if (fromAccount) return fromAccount;
  const un = presence && presence.username ? String(presence.username).trim() : "";
  return un || "Player";
}

function opponentUserId(state: TicMatchState, uid: string): string | null {
  const ids = seatedUserIds(state);
  const o = ids.find((id) => id !== uid);
  return o === undefined ? null : o;
}

function userIdForSeat(state: TicMatchState, seat: 0 | 1): string | null {
  for (const id of seatedUserIds(state)) {
    if (state.seatByUserId[id] === seat) return id;
  }
  return null;
}

/** One bot ply if it is the bot's turn (playing phase). */
function maybePlayBotMove(
  state: TicMatchState,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  dispatcher: nkruntime.MatchDispatcher,
): void {
  if (state.phase !== "playing" || !state.vsBot) return;
  const turnSeat = state.currentTurnSeat;
  const actor = userIdForSeat(state, turnSeat);
  if (actor !== BOT_USER_ID) return;
  const cell = pickBotMove(state.board, turnSeat);
  const nextBoard = applyMove(state.board, cell, turnSeat);
  if (!nextBoard) {
    logger.warn("maybePlayBotMove invalid cell=%d", cell);
    return;
  }
  state.board = nextBoard;
  const winMark = checkWinner(state.board);
  if (winMark !== 0) {
    const winnerSeat: 0 | 1 = cellMarkForSeat(0) === winMark ? 0 : 1;
    finishMatch(state, winnerSeat, false, nk, logger);
    broadcastState(dispatcher, state);
    return;
  }
  if (isDraw(state.board)) {
    finishMatch(state, null, true, nk, logger);
    broadcastState(dispatcher, state);
    return;
  }
  state.currentTurnSeat = state.currentTurnSeat === 0 ? 1 : 0;
  if (state.timed) {
    state.moveDeadlineMs = nowMs() + MOVE_TIMEOUT_MS;
  }
  broadcastState(dispatcher, state);
}

const matchInit: nkruntime.MatchInitFunction<TicMatchState> = function (_ctx, logger, _nk, params) {
  const timed = params["timed"] === "1";
  const vsBot = params["vs_bot"] === "1" || params["vs_bot"] === "true";
  const rc = params["room_code"];
  const roomCode =
    vsBot || rc === undefined || rc === null ? "" : String(rc).trim().slice(0, 4);
  const state: TicMatchState = {
    timed,
    vsBot,
    phase: "waiting",
    board: emptyBoard(),
    seatByUserId: {},
    presenceByUserId: {},
    accountLabelByUserId: {},
    disconnectAtMs: {},
    currentTurnSeat: 0,
    winnerSeat: null,
    draw: false,
    moveDeadlineMs: 0,
    emptyTicks: 0,
    finishedTicks: 0,
    statsWritten: false,
    rematchRequestedBy: null,
    pendingTerminate: false,
    roomCode: !vsBot && /^\d{4}$/.test(roomCode) ? roomCode : "",
  };
  logger.info(
    "matchInit module=%s timed=%s vs_bot=%s label=%s room_code=%s",
    MATCH_MODULE,
    timed,
    vsBot,
    vsBot ? MATCH_LABEL_BOT : MATCH_LABEL,
    state.roomCode,
  );
  return { state, tickRate: TICK_RATE, label: vsBot ? MATCH_LABEL_BOT : MATCH_LABEL };
};

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<TicMatchState> = function (
  _ctx,
  logger,
  _nk,
  _dispatcher,
  _tick,
  state,
  presence,
  _metadata,
) {
  const uid = presence.userId;
  const existingPresence = state.presenceByUserId[uid];

  if (existingPresence) {
    logger.warn("join_attempt reject already_in_match user=%s", uid);
    return { state, accept: false, rejectMessage: "already_in_match" };
  }

  if (uid in state.seatByUserId && existingPresence === null) {
    logger.info("join_attempt rejoin user=%s", uid);
    return { state, accept: true };
  }

  if (state.vsBot && uid !== BOT_USER_ID && !(uid in state.seatByUserId)) {
    const humanCount = seatedUserIds(state).filter((id) => id !== BOT_USER_ID).length;
    if (humanCount >= 1) {
      logger.warn("join_attempt reject bot_room_full user=%s", uid);
      return { state, accept: false, rejectMessage: "match_full" };
    }
  }

  if (seatedUserIds(state).length >= 2) {
    logger.warn("join_attempt reject match_full user=%s", uid);
    return { state, accept: false, rejectMessage: "match_full" };
  }

  return { state, accept: true };
};

const matchJoin: nkruntime.MatchJoinFunction<TicMatchState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  _tick,
  state,
  presences,
) {
  for (const p of presences) {
    const uid = p.userId;
    if (uid === BOT_USER_ID) continue;

    if (state.vsBot) {
      if (!(uid in state.seatByUserId)) {
        state.seatByUserId[uid] = 0;
        state.seatByUserId[BOT_USER_ID] = 1;
        state.presenceByUserId[BOT_USER_ID] = null;
        state.accountLabelByUserId[BOT_USER_ID] = "Monvish";
        logger.info("matchJoin vs_bot human=%s bot seat=1 match=%s", uid, ctx.matchId);
      }
      state.presenceByUserId[uid] = p;
      delete state.disconnectAtMs[uid];
      continue;
    }

    if (!(uid in state.seatByUserId)) {
      const seatsTaken = new Set(Object.values(state.seatByUserId));
      const seat: 0 | 1 = !seatsTaken.has(0) ? 0 : 1;
      state.seatByUserId[uid] = seat;
      logger.info("matchJoin assign_seat match=%s user=%s seat=%d", ctx.matchId, uid, seat);
    }
    state.presenceByUserId[uid] = p;
    delete state.disconnectAtMs[uid];
  }

  syncAccountLabels(nk, state);

  if (state.phase === "waiting" && seatedUserIds(state).length === 2) {
    startPlaying(state);
    logger.info("matchJoin start_playing match=%s", ctx.matchId);
    broadcastState(dispatcher, state);
  } else if (state.phase === "playing") {
    broadcastState(dispatcher, state);
  } else {
    broadcastState(dispatcher, state);
  }

  return { state };
};

const matchLeave: nkruntime.MatchLeaveFunction<TicMatchState> = function (
  ctx,
  logger,
  _nk,
  dispatcher,
  _tick,
  state,
  presences,
) {
  const t = nowMs();
  const leavingIds = new Set(presences.map((p) => p.userId));

  if (state.phase === "finished" && state.rematchRequestedBy) {
    state.rematchRequestedBy = null;
    const staying = seatedUserIds(state).filter((id) => !leavingIds.has(id));
    const leaverId = presences[0] ? presences[0].userId : "";
    for (const sid of staying) {
      const pr = state.presenceByUserId[sid];
      if (pr) {
        dispatcher.broadcastMessage(
          OpCode.RematchDeclined,
          JSON.stringify({
            decliner_name: "Opponent",
            decliner_user_id: leaverId,
            reason: "left",
          }),
          [pr],
          null,
          true,
        );
      }
    }
    state.pendingTerminate = true;
  }

  for (const p of presences) {
    const uid = p.userId;
    logger.info("matchLeave match=%s user=%s phase=%s", ctx.matchId, uid, state.phase);
    if (state.phase === "waiting") {
      delete state.seatByUserId[uid];
      delete state.presenceByUserId[uid];
      delete state.accountLabelByUserId[uid];
      delete state.disconnectAtMs[uid];
      if (state.vsBot) {
        delete state.seatByUserId[BOT_USER_ID];
        delete state.presenceByUserId[BOT_USER_ID];
        delete state.accountLabelByUserId[BOT_USER_ID];
      }
    } else {
      state.presenceByUserId[uid] = null;
      state.disconnectAtMs[uid] = t;
    }
  }

  if (state.phase === "playing") {
    broadcastState(dispatcher, state);
  } else if (state.phase === "waiting") {
    broadcastState(dispatcher, state);
  }

  return { state };
};

const matchLoop: nkruntime.MatchLoopFunction<TicMatchState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  tick,
  state,
  messages,
) {
  if (state.pendingTerminate) {
    logger.info("matchLoop terminate pending flag match=%s", ctx.matchId);
    return null;
  }

  if (seatedUserIds(state).length === 0 && state.phase === "waiting") {
    state.emptyTicks++;
    if (state.emptyTicks > TICK_RATE * 120) {
      logger.info("matchLoop terminate idle waiting match=%s", ctx.matchId);
      return null;
    }
  } else {
    state.emptyTicks = 0;
  }

  if (state.phase === "playing" && state.timed && state.moveDeadlineMs > 0 && nowMs() > state.moveDeadlineMs) {
    const curUid = userIdForSeat(state, state.currentTurnSeat);
    if (!(state.vsBot && curUid === BOT_USER_ID)) {
      const loser = state.currentTurnSeat;
      const winnerSeat: 0 | 1 = loser === 0 ? 1 : 0;
      logger.info("matchLoop move_timeout match=%s winner_seat=%d", ctx.matchId, winnerSeat);
      finishMatch(state, winnerSeat, false, nk, logger);
      broadcastState(dispatcher, state);
    }
  }

  if (state.phase === "playing") {
    for (const uid of seatedUserIds(state)) {
      if (uid === BOT_USER_ID) continue;
      if (state.presenceByUserId[uid]) continue;
      const leftAt = state.disconnectAtMs[uid];
      if (!leftAt) continue;
      if (nowMs() - leftAt > DISCONNECT_FORFEIT_MS) {
        const forfeitedSeat = state.seatByUserId[uid];
        if (forfeitedSeat === undefined) continue;
        const winnerSeat: 0 | 1 = forfeitedSeat === 0 ? 1 : 0;
        logger.info("matchLoop disconnect_forfeit match=%s winner_seat=%d", ctx.matchId, winnerSeat);
        finishMatch(state, winnerSeat, false, nk, logger);
        broadcastState(dispatcher, state);
        break;
      }
    }
  }

  for (const message of messages) {
    const op = message.opCode;

    if (op === OpCode.PlayAgainRequest) {
      const uid = message.sender.userId;
      if (state.phase !== "finished") {
        sendError(dispatcher, message.sender, "REMATCH_NOT_FINISHED");
        continue;
      }
      if (!(uid in state.seatByUserId)) {
        sendError(dispatcher, message.sender, "NOT_SEATED");
        continue;
      }
      const other = opponentUserId(state, uid);
      if (!other) {
        sendError(dispatcher, message.sender, "NO_OPPONENT");
        continue;
      }
      if (other === BOT_USER_ID) {
        state.rematchRequestedBy = null;
        state.finishedTicks = 0;
        state.statsWritten = false;
        startPlaying(state);
        broadcastState(dispatcher, state);
        continue;
      }
      const opPresence = state.presenceByUserId[other];
      if (!opPresence) {
        sendError(dispatcher, message.sender, "OPPONENT_OFFLINE");
        continue;
      }
      if (state.rematchRequestedBy && state.rematchRequestedBy !== uid) {
        sendError(dispatcher, message.sender, "REMATCH_PENDING");
        continue;
      }
      syncAccountLabels(nk, state);
      state.rematchRequestedBy = uid;
      state.finishedTicks = 0;
      const requesterName = displayNameForSeatUser(state, uid, message.sender);
      dispatcher.broadcastMessage(
        OpCode.RematchPrompt,
        JSON.stringify({ requester_user_id: uid, requester_name: requesterName }),
        [opPresence],
        null,
        true,
      );
      continue;
    }

    if (op === OpCode.PlayAgainAnswer) {
      const uid = message.sender.userId;
      if (state.phase !== "finished") {
        sendError(dispatcher, message.sender, "REMATCH_NOT_FINISHED");
        continue;
      }
      const pending = state.rematchRequestedBy;
      if (!pending) {
        sendError(dispatcher, message.sender, "NO_REMATCH_REQUEST");
        continue;
      }
      if (uid === pending) {
        sendError(dispatcher, message.sender, "REMATCH_SELF_ANSWER");
        continue;
      }
      const expectedOpponent = opponentUserId(state, pending);
      if (uid !== expectedOpponent && !(expectedOpponent === BOT_USER_ID && state.vsBot)) {
        sendError(dispatcher, message.sender, "NOT_REMATCH_OPPONENT");
        continue;
      }
      let accept = false;
      try {
        const raw = nk.binaryToString(message.data);
        const parsed = JSON.parse(raw) as { accept?: boolean };
        accept = parsed.accept === true;
      } catch {
        sendError(dispatcher, message.sender, "BAD_PAYLOAD");
        continue;
      }
      if (accept) {
        state.rematchRequestedBy = null;
        state.finishedTicks = 0;
        state.statsWritten = false;
        startPlaying(state);
        broadcastState(dispatcher, state);
      } else {
        syncAccountLabels(nk, state);
        const declinerName = displayNameForSeatUser(state, uid, message.sender);
        state.rematchRequestedBy = null;
        dispatcher.broadcastMessage(
          OpCode.RematchDeclined,
          JSON.stringify({
            decliner_name: declinerName,
            decliner_user_id: uid,
            reason: "declined",
          }),
          null,
          null,
          true,
        );
        logger.info("matchLoop rematch declined match=%s", ctx.matchId);
        return null;
      }
      continue;
    }

    if (op !== OpCode.MoveIntent) {
      sendError(dispatcher, message.sender, "UNKNOWN_OPCODE", String(op));
      continue;
    }

    let cell: number;
    try {
      const raw = nk.binaryToString(message.data);
      const parsed = JSON.parse(raw) as { c?: number };
      if (typeof parsed.c !== "number" || !Number.isInteger(parsed.c)) {
        sendError(dispatcher, message.sender, "BAD_PAYLOAD");
        continue;
      }
      cell = parsed.c;
    } catch {
      sendError(dispatcher, message.sender, "BAD_PAYLOAD");
      continue;
    }

    const uid = message.sender.userId;
    const seat = userSeat(state, uid);
    if (state.phase !== "playing" || seat === null) {
      sendError(dispatcher, message.sender, "INVALID_PHASE");
      continue;
    }
    if (state.currentTurnSeat !== seat) {
      sendError(dispatcher, message.sender, "INVALID_TURN");
      continue;
    }

    const nextBoard = applyMove(state.board, cell, seat);
    if (!nextBoard) {
      sendError(dispatcher, message.sender, "INVALID_MOVE", "cell_taken_or_range");
      continue;
    }
    state.board = nextBoard;

    const winMark = checkWinner(state.board);
    if (winMark !== 0) {
      const winnerSeat: 0 | 1 = cellMarkForSeat(0) === winMark ? 0 : 1;
      finishMatch(state, winnerSeat, false, nk, logger);
      broadcastState(dispatcher, state);
      continue;
    }
    if (isDraw(state.board)) {
      finishMatch(state, null, true, nk, logger);
      broadcastState(dispatcher, state);
      continue;
    }

    state.currentTurnSeat = state.currentTurnSeat === 0 ? 1 : 0;
    if (state.timed) {
      state.moveDeadlineMs = nowMs() + MOVE_TIMEOUT_MS;
    }
    broadcastState(dispatcher, state);
    if (state.vsBot) {
      maybePlayBotMove(state, nk, logger, dispatcher);
    }
  }

  if (state.phase === "playing" && state.vsBot) {
    maybePlayBotMove(state, nk, logger, dispatcher);
  }

  if (state.phase === "finished") {
    if (!state.rematchRequestedBy) {
      state.finishedTicks++;
      if (state.finishedTicks > FINISHED_MATCH_TTL_TICKS) {
        logger.info("matchLoop terminate finished match=%s", ctx.matchId);
        return null;
      }
    }
  }

  return { state };
};

const matchTerminate: nkruntime.MatchTerminateFunction<TicMatchState> = function (
  ctx,
  logger,
  nk,
  _dispatcher,
  _tick,
  state,
  graceSeconds,
) {
  if (state.roomCode) {
    try {
      releaseRoomCodeMapping(nk, ctx.matchId, state.roomCode);
    } catch (e) {
      logger.warn("matchTerminate release room code match=%s: %s", ctx.matchId, String(e));
    }
  }
  logger.info("matchTerminate match=%s grace=%d", ctx.matchId, graceSeconds);
  return { state };
};

const matchSignal: nkruntime.MatchSignalFunction<TicMatchState> = function (_ctx, _logger, _nk, _dispatcher, _tick, state, _data) {
  return { state };
};

export const ticTacToeMatchHandler: nkruntime.MatchHandler<TicMatchState> = {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal,
};
