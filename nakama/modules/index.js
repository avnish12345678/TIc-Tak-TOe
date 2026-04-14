var module=module||{exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  InitModule: () => InitModule
});
module.exports = __toCommonJS(main_exports);

// src/constants.ts
var MATCH_MODULE = "tictactoe_auth";
var MATCH_LABEL = "tictactoe";
var MATCH_LABEL_BOT = "tictactoe_bot";
var TICK_RATE = 10;
var OpCode = {
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
  RematchDeclined: 7
};
var LB_WINS = "tic_tac_toe_wins";
var BOT_USER_ID = "00000000-0000-0000-0000-0000000000b0";
var MOVE_TIMEOUT_MS = 3e4;
var DISCONNECT_FORFEIT_MS = 12e4;
var FINISHED_MATCH_TTL_TICKS = 30 * TICK_RATE;

// src/leaderboard.ts
function ensureLeaderboards(nk, logger) {
  try {
    nk.leaderboardCreate(
      LB_WINS,
      true,
      "descending",
      "best",
      null,
      { description: "Tic-Tac-Toe wins" },
      true
    );
    logger.info("leaderboard created: %s", LB_WINS);
  } catch (e) {
    logger.debug("leaderboard %s already exists or create skipped: %s", LB_WINS, String(e));
  }
}
function recordWin(nk, logger, winnerUserId) {
  try {
    nk.leaderboardRecordWrite(
      LB_WINS,
      winnerUserId,
      void 0,
      1,
      0,
      {},
      "increment"
    );
  } catch (e) {
    logger.error("leaderboardRecordWrite failed for %s: %s", winnerUserId, String(e));
  }
}

// src/game_logic.ts
var LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];
function emptyBoard() {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}
function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== 0 && v === board[b] && v === board[c]) return v;
  }
  return 0;
}
function isDraw(board) {
  return board.every((c) => c !== 0);
}
function cellMarkForSeat(seat) {
  return seat === 0 ? 1 : 2;
}
function applyMove(board, cell, seat) {
  if (cell < 0 || cell > 8) return null;
  if (board[cell] !== 0) return null;
  const next = board.slice();
  next[cell] = cellMarkForSeat(seat);
  return next;
}

// src/bot_logic.ts
function minimaxScore(board, botToMove, botSeat) {
  const botMark = cellMarkForSeat(botSeat);
  const w = checkWinner(board);
  if (w !== 0) return w === botMark ? 1 : -1;
  if (isDraw(board)) return 0;
  if (botToMove) {
    let best2 = -2;
    for (let c = 0; c < 9; c++) {
      const nb = applyMove(board, c, botSeat);
      if (!nb) continue;
      best2 = Math.max(best2, minimaxScore(nb, false, botSeat));
    }
    return best2;
  }
  const opSeat = botSeat === 0 ? 1 : 0;
  let best = 2;
  for (let c = 0; c < 9; c++) {
    const nb = applyMove(board, c, opSeat);
    if (!nb) continue;
    best = Math.min(best, minimaxScore(nb, true, botSeat));
  }
  return best;
}
function pickBotMove(board, botSeat) {
  const candidates = [];
  let best = -2;
  for (let c = 0; c < 9; c++) {
    const nb = applyMove(board, c, botSeat);
    if (!nb) continue;
    const s = minimaxScore(nb, false, botSeat);
    if (s > best) {
      best = s;
      candidates.length = 0;
      candidates.push(c);
    } else if (s === best) {
      candidates.push(c);
    }
  }
  if (candidates.length === 0) return 0;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// src/room_codes.ts
var SYS_USER = "00000000-0000-0000-0000-000000000000";
var COLL_ROOM_CODE = "ttt_room_code";
var COLL_MATCH_CODE = "ttt_match_code";
function matchKeyFromMatchId(matchId) {
  return matchId.replace(/\./g, "_");
}
function pickUnusedRoomCode(nk) {
  for (let i = 0; i < 120; i++) {
    const code = String(Math.floor(Math.random() * 1e4)).padStart(4, "0");
    const objs = nk.storageRead([{ collection: COLL_ROOM_CODE, key: code, userId: SYS_USER }]);
    if (!objs || objs.length === 0) return code;
  }
  return null;
}
function writeRoomCodeMapping(nk, matchId, code) {
  const mk = matchKeyFromMatchId(matchId);
  nk.storageWrite([
    {
      collection: COLL_ROOM_CODE,
      key: code,
      userId: SYS_USER,
      value: { match_id: matchId },
      permissionRead: 0,
      permissionWrite: 0
    },
    {
      collection: COLL_MATCH_CODE,
      key: mk,
      userId: SYS_USER,
      value: { code },
      permissionRead: 0,
      permissionWrite: 0
    }
  ]);
}
function releaseRoomCodeMapping(nk, matchId, roomCode) {
  if (!roomCode) return;
  const mk = matchKeyFromMatchId(matchId);
  nk.storageDelete([
    { collection: COLL_ROOM_CODE, key: roomCode, userId: SYS_USER },
    { collection: COLL_MATCH_CODE, key: mk, userId: SYS_USER }
  ]);
}
function readCodeForMatch(nk, matchId) {
  try {
    const objs = nk.storageRead([
      { collection: COLL_MATCH_CODE, key: matchKeyFromMatchId(matchId), userId: SYS_USER }
    ]);
    if (objs && objs[0] && objs[0].value) {
      const c = objs[0].value["code"];
      if (c !== void 0 && c !== null) return String(c);
    }
  } catch {
  }
  return "";
}

// src/match_handler.ts
function nowMs() {
  return Date.now();
}
function seatedUserIds(state) {
  return Object.keys(state.seatByUserId);
}
function labelFromUser(u) {
  const dn = u.displayName && String(u.displayName).trim();
  const un = u.username && String(u.username).trim();
  return dn || un || "";
}
function syncAccountLabels(nk, state) {
  const ids = seatedUserIds(state).filter((id) => id !== BOT_USER_ID);
  if (ids.length === 0) return;
  const users = nk.usersGetId(ids) ?? [];
  for (const u of users) {
    const label = labelFromUser(u);
    if (label) state.accountLabelByUserId[u.userId] = label;
  }
}
function buildSnapshot(state) {
  const seatUserIds = [null, null];
  const seatUsernames = [null, null];
  for (const uid of seatedUserIds(state)) {
    const seat = state.seatByUserId[uid];
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
    vs_bot: state.vsBot
  };
  return JSON.stringify(snap);
}
function broadcastState(dispatcher, state) {
  dispatcher.broadcastMessage(OpCode.StateSnapshot, buildSnapshot(state), null, null, true);
}
function sendError(dispatcher, sender, code, detail) {
  dispatcher.broadcastMessage(
    OpCode.Error,
    JSON.stringify({ code, detail: detail ?? "" }),
    [sender],
    null,
    true
  );
}
function startPlaying(state) {
  state.phase = "playing";
  state.board = emptyBoard();
  state.currentTurnSeat = 0;
  state.winnerSeat = null;
  state.draw = false;
  state.moveDeadlineMs = state.timed ? nowMs() + MOVE_TIMEOUT_MS : 0;
}
function finishMatch(state, winnerSeat, draw, nk, logger) {
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
function userSeat(state, userId) {
  const s = state.seatByUserId[userId];
  return s === void 0 ? null : s;
}
function displayNameForSeatUser(state, uid, presence) {
  const fromAccount = state.accountLabelByUserId[uid]?.trim();
  if (fromAccount) return fromAccount;
  const un = presence && presence.username ? String(presence.username).trim() : "";
  return un || "Player";
}
function opponentUserId(state, uid) {
  const ids = seatedUserIds(state);
  const o = ids.find((id) => id !== uid);
  return o === void 0 ? null : o;
}
function userIdForSeat(state, seat) {
  for (const id of seatedUserIds(state)) {
    if (state.seatByUserId[id] === seat) return id;
  }
  return null;
}
function maybePlayBotMove(state, nk, logger, dispatcher) {
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
    const winnerSeat = cellMarkForSeat(0) === winMark ? 0 : 1;
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
var matchInit = function(_ctx, logger, _nk, params) {
  const timed = params["timed"] === "1";
  const vsBot = params["vs_bot"] === "1" || params["vs_bot"] === "true";
  const rc = params["room_code"];
  const roomCode = vsBot || rc === void 0 || rc === null ? "" : String(rc).trim().slice(0, 4);
  const state = {
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
    roomCode: !vsBot && /^\d{4}$/.test(roomCode) ? roomCode : ""
  };
  logger.info(
    "matchInit module=%s timed=%s vs_bot=%s label=%s room_code=%s",
    MATCH_MODULE,
    timed,
    vsBot,
    vsBot ? MATCH_LABEL_BOT : MATCH_LABEL,
    state.roomCode
  );
  return { state, tickRate: TICK_RATE, label: vsBot ? MATCH_LABEL_BOT : MATCH_LABEL };
};
var matchJoinAttempt = function(_ctx, logger, _nk, _dispatcher, _tick, state, presence, _metadata) {
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
var matchJoin = function(ctx, logger, nk, dispatcher, _tick, state, presences) {
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
      const seat = !seatsTaken.has(0) ? 0 : 1;
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
var matchLeave = function(ctx, logger, _nk, dispatcher, _tick, state, presences) {
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
            reason: "left"
          }),
          [pr],
          null,
          true
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
var matchLoop = function(ctx, logger, nk, dispatcher, tick, state, messages) {
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
      const winnerSeat = loser === 0 ? 1 : 0;
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
        if (forfeitedSeat === void 0) continue;
        const winnerSeat = forfeitedSeat === 0 ? 1 : 0;
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
      const uid2 = message.sender.userId;
      if (state.phase !== "finished") {
        sendError(dispatcher, message.sender, "REMATCH_NOT_FINISHED");
        continue;
      }
      if (!(uid2 in state.seatByUserId)) {
        sendError(dispatcher, message.sender, "NOT_SEATED");
        continue;
      }
      const other = opponentUserId(state, uid2);
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
      if (state.rematchRequestedBy && state.rematchRequestedBy !== uid2) {
        sendError(dispatcher, message.sender, "REMATCH_PENDING");
        continue;
      }
      syncAccountLabels(nk, state);
      state.rematchRequestedBy = uid2;
      state.finishedTicks = 0;
      const requesterName = displayNameForSeatUser(state, uid2, message.sender);
      dispatcher.broadcastMessage(
        OpCode.RematchPrompt,
        JSON.stringify({ requester_user_id: uid2, requester_name: requesterName }),
        [opPresence],
        null,
        true
      );
      continue;
    }
    if (op === OpCode.PlayAgainAnswer) {
      const uid2 = message.sender.userId;
      if (state.phase !== "finished") {
        sendError(dispatcher, message.sender, "REMATCH_NOT_FINISHED");
        continue;
      }
      const pending = state.rematchRequestedBy;
      if (!pending) {
        sendError(dispatcher, message.sender, "NO_REMATCH_REQUEST");
        continue;
      }
      if (uid2 === pending) {
        sendError(dispatcher, message.sender, "REMATCH_SELF_ANSWER");
        continue;
      }
      const expectedOpponent = opponentUserId(state, pending);
      if (uid2 !== expectedOpponent && !(expectedOpponent === BOT_USER_ID && state.vsBot)) {
        sendError(dispatcher, message.sender, "NOT_REMATCH_OPPONENT");
        continue;
      }
      let accept = false;
      try {
        const raw = nk.binaryToString(message.data);
        const parsed = JSON.parse(raw);
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
        const declinerName = displayNameForSeatUser(state, uid2, message.sender);
        state.rematchRequestedBy = null;
        dispatcher.broadcastMessage(
          OpCode.RematchDeclined,
          JSON.stringify({
            decliner_name: declinerName,
            decliner_user_id: uid2,
            reason: "declined"
          }),
          null,
          null,
          true
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
    let cell;
    try {
      const raw = nk.binaryToString(message.data);
      const parsed = JSON.parse(raw);
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
      const winnerSeat = cellMarkForSeat(0) === winMark ? 0 : 1;
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
var matchTerminate = function(ctx, logger, nk, _dispatcher, _tick, state, graceSeconds) {
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
var matchSignal = function(_ctx, _logger, _nk, _dispatcher, _tick, state, _data) {
  return { state };
};
var ticTacToeMatchHandler = {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal
};

// src/rpc_rooms.ts
function parseTimed(payload) {
  try {
    const o = JSON.parse(payload || "{}");
    return o.timed === true || o.timed === 1 || o.timed === "1";
  } catch {
    return false;
  }
}
function rpcCreateBotRoom(ctx, logger, nk, payload) {
  const timed = parseTimed(payload);
  const matchId = nk.matchCreate(MATCH_MODULE, { timed: timed ? "1" : "0", vs_bot: "1" });
  logger.info("create_bot_room user=%s match=%s timed=%s", ctx.userId, matchId, timed);
  return JSON.stringify({ match_id: matchId, timed, vs_bot: true });
}
function rpcCreateRoom(ctx, logger, nk, payload) {
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
function rpcListOpenRooms(ctx, logger, nk, payload) {
  let limit = 20;
  try {
    const o = JSON.parse(payload || "{}");
    if (typeof o.limit === "number" && o.limit > 0 && o.limit <= 50) limit = o.limit;
  } catch {
  }
  try {
    const matches = nk.matchList(limit, true, MATCH_LABEL, 1, 1, null) ?? [];
    const rooms = matches.map((m) => ({
      match_id: m.matchId,
      size: m.size,
      label: m.label,
      room_code: readCodeForMatch(nk, m.matchId) || null
    }));
    logger.debug("list_open_rooms user=%s count=%d", ctx.userId, rooms.length);
    return JSON.stringify({ rooms });
  } catch (e) {
    logger.error("list_open_rooms failed: %s", String(e));
    return JSON.stringify({ rooms: [], error: "match_list_failed" });
  }
}
function rpcLeaderboardTop(ctx, logger, nk, payload) {
  let limit = 10;
  try {
    const o = JSON.parse(payload || "{}");
    if (typeof o.limit === "number" && o.limit > 0 && o.limit <= 100) limit = o.limit;
  } catch {
  }
  try {
    const res = nk.leaderboardRecordsList(LB_WINS, [], limit);
    const raw = res.records ?? [];
    const ownerIds = [...new Set(raw.map((r) => r.ownerId).filter((id) => !!id))];
    const users = ownerIds.length > 0 ? nk.usersGetId(ownerIds) ?? [] : [];
    const nameByUserId = {};
    for (const u of users) {
      const fromUser = u.displayName && String(u.displayName).trim() || u.username && String(u.username).trim() || "";
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
        metadata: r.metadata
      };
    });
    return JSON.stringify({ records, next_cursor: res.nextCursor });
  } catch (e) {
    logger.error("leaderboard_top failed: %s", String(e));
    return JSON.stringify({ records: [], next_cursor: "" });
  }
}
function normalizeFourDigitCode(payload) {
  try {
    const o = JSON.parse(payload || "{}");
    const digits = String(o.code ?? "").replace(/\D/g, "");
    if (digits.length !== 4) return null;
    return digits;
  } catch {
    return null;
  }
}
function rpcRoomByCode(ctx, logger, nk, payload) {
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

// src/main.ts
function matchmakerTimedFromEntries(entries) {
  for (const e of entries) {
    const p = e.properties || {};
    if (p["timed"] === "1" || p["timed"] === "true") return true;
  }
  return false;
}
function onMatchmakerMatched(_ctx, logger, nk, matches) {
  if (!matches || matches.length < 2) {
    logger.warn("matchmaker_matched insufficient players: %d", matches ? matches.length : 0);
    return;
  }
  const timed = matchmakerTimedFromEntries(matches);
  const matchId = nk.matchCreate(MATCH_MODULE, { timed: timed ? "1" : "0" });
  logger.info("matchmaker_matched -> authoritative match=%s timed=%s players=%d", matchId, timed, matches.length);
  return matchId;
}
function InitModule(_ctx, logger, nk, initializer) {
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
    MATCH_MODULE
  );
}
globalThis.InitModule=module.exports.InitModule;
