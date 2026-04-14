import type { Socket } from "@heroiclabs/nakama-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./components/Board";
import { Lobby } from "./components/Lobby";
import { Register } from "./components/Register";
import { WinCelebration } from "./components/WinCelebration";
import {
  authenticateWithDisplayName,
  createSocket,
  getClient,
  getSession,
  getStoredDisplayName,
  setStoredDisplayName,
  tryRestoreSession,
  signOutSession,
  wipeAllLocalIdentity,
  hasLinkedDevice,
} from "./nakama/client";
import { callRuntimeRpc } from "./nakama/runtimeRpc";
import {
  OpCode,
  type GameSnapshot,
  type RematchDeclinedPayload,
  type RematchPromptPayload,
  type ServerErrorPayload,
} from "./nakama/protocol";
import { formatNakamaError } from "./util/errors";
import { matchHeadline, seatDisplayName } from "./util/matchDisplay";
import { userIdFromSession } from "./util/sessionUser";

type Conn = "disconnected" | "connecting" | "connected";

function decodeMatchData(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

export default function App() {
  const [playerName, setPlayerName] = useState<string | null>(() => getStoredDisplayName());
  /** After a display name exists, start as `connecting` so the lobby does not flash a false "retry" before bootstrap. */
  const [conn, setConn] = useState<Conn>(() => (getStoredDisplayName() ? "connecting" : "disconnected"));
  /** Bump to re-run the Nakama bootstrap effect (e.g. after starting Docker). */
  const [connectNonce, setConnectNonce] = useState(0);
  const [screen, setScreen] = useState<"lobby" | "game" | "leaderboard">("lobby");
  const [timedMode, setTimedMode] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [rooms, setRooms] = useState<{ match_id: string; size: number; room_code?: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [lbRows, setLbRows] = useState<{ owner_id: string; username: string; score: number }[]>([]);
  const [rematchPrompt, setRematchPrompt] = useState<RematchPromptPayload | null>(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const matchmakerTicketRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const userIdRef = useRef("");
  const leaveGameRef = useRef<() => Promise<void>>(async () => {});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshRooms = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    try {
      const res = await callRuntimeRpc(socketRef.current, s, "list_open_rooms", { limit: 20 });
      const body = (res.payload ?? {}) as { rooms?: { match_id: string; size: number; room_code?: string | null }[] };
      setRooms(body.rooms ?? []);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    try {
      const res = await callRuntimeRpc(socketRef.current, s, "leaderboard_top", { limit: 15 });
      const body = (res.payload ?? {}) as {
        records?: { owner_id: string; username: string; score: number }[];
      };
      setLbRows(body.records ?? []);
    } catch (e) {
      console.warn(e);
      setLbRows([]);
    }
  }, []);

  const teardownSocket = useCallback(() => {
    const sock = socketRef.current;
    if (sock) {
      try {
        sock.disconnect(false);
      } catch {
        // ignore
      }
      socketRef.current = null;
    }
  }, []);

  const handleSignOut = useCallback(() => {
    teardownSocket();
    signOutSession();
    setPlayerName(null);
    setUserId("");
    setRooms([]);
    setErr(null);
    setConn("disconnected");
    setConnectNonce((n) => n + 1);
  }, [teardownSocket]);

  const handleWipeLocalAccount = useCallback(() => {
    teardownSocket();
    wipeAllLocalIdentity();
    setPlayerName(null);
    setUserId("");
    setRooms([]);
    setErr(null);
    setConn("disconnected");
    setConnectNonce((n) => n + 1);
  }, [teardownSocket]);

  const leaveGame = useCallback(async () => {
    const sock = socketRef.current;
    if (sock && matchId) {
      try {
        await sock.leaveMatch(matchId);
      } catch {
        // ignore
      }
    }
    const ticket = matchmakerTicketRef.current;
    if (sock && ticket) {
      try {
        await sock.removeMatchmaker(ticket);
      } catch {
        // ignore
      }
      matchmakerTicketRef.current = null;
    }
    setMatchId(null);
    setSnapshot(null);
    setRematchPrompt(null);
    setRematchWaiting(false);
    setScreen("lobby");
    await refreshRooms();
  }, [matchId, refreshRooms]);

  useEffect(() => {
    leaveGameRef.current = leaveGame;
  }, [leaveGame]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    mounted.current = true;

    if (!playerName) {
      setConn("disconnected");
      return () => {
        mounted.current = false;
      };
    }

    const wireSocket = (sock: Socket) => {
      sock.onmatchdata = (md) => {
        if (md.op_code === OpCode.StateSnapshot) {
          try {
            const snap = JSON.parse(decodeMatchData(md.data)) as GameSnapshot;
            if (!mounted.current) return;
            setSnapshot(snap);
            if (snap.phase === "playing") {
              setRematchPrompt(null);
              setRematchWaiting(false);
            }
          } catch {
            showToast("Bad state from server");
          }
        } else if (md.op_code === OpCode.RematchPrompt) {
          try {
            const p = JSON.parse(decodeMatchData(md.data)) as RematchPromptPayload;
            if (mounted.current) setRematchPrompt(p);
          } catch {
            showToast("Invalid rematch prompt");
          }
        } else if (md.op_code === OpCode.RematchDeclined) {
          try {
            const p = JSON.parse(decodeMatchData(md.data)) as RematchDeclinedPayload;
            if (!mounted.current) return;
            setRematchPrompt(null);
            setRematchWaiting(false);
            const selfId = userIdRef.current;
            if (p.reason === "left") {
              showToast("Opponent left. Returning to lobby…");
            } else if (p.decliner_user_id && p.decliner_user_id === selfId) {
              showToast("You chose not to play again. Returning to lobby…");
            } else {
              showToast(`${p.decliner_name} does not want to continue. Returning to lobby…`);
            }
            window.setTimeout(() => {
              void leaveGameRef.current();
            }, 2200);
          } catch {
            showToast("Could not parse rematch result");
            window.setTimeout(() => {
              void leaveGameRef.current();
            }, 1500);
          }
        } else if (md.op_code === OpCode.Error) {
          try {
            const p = JSON.parse(decodeMatchData(md.data)) as ServerErrorPayload;
            setRematchWaiting(false);
            showToast(p.code + (p.detail ? `: ${p.detail}` : ""));
          } catch {
            setRematchWaiting(false);
            showToast("Server error");
          }
        }
      };

      sock.onmatchmakermatched = async (mm) => {
        try {
          if (!mounted.current) return;
          setBusy(true);
          setErr(null);
          const m = await sock.joinMatch(undefined, mm.token);
          if (!mounted.current) return;
          setMatchId(m.match_id);
          setRematchPrompt(null);
          setRematchWaiting(false);
          setScreen("game");
          matchmakerTicketRef.current = null;
        } catch (e) {
          if (mounted.current) void formatNakamaError(e).then((msg) => mounted.current && setErr(msg));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };

      sock.ondisconnect = () => {
        if (!mounted.current) return;
        setConn("disconnected");
      };
    };

    async function bootstrap() {
      const displayName = playerName;
      if (!displayName) return;

      setConn("connecting");
      setErr(null);
      try {
        let s = tryRestoreSession();
        if (!s) {
          s = await authenticateWithDisplayName(displayName);
        } else {
          try {
            await getClient().updateAccount(s, { username: displayName });
          } catch {
            // ignore
          }
        }
        if (!mounted.current) return;
        setUserId(userIdFromSession(s));
        const sock = createSocket();
        await sock.connect(s, true);
        if (!mounted.current) return;
        socketRef.current = sock;
        wireSocket(sock);
        setConn("connected");
        // Do not fail the whole session if optional HTTP RPCs error after the socket is up.
        try {
          await refreshRooms();
        } catch (e) {
          console.warn("refreshRooms:", e);
        }
      } catch (e) {
        if (mounted.current) {
          const raw = await formatNakamaError(e);
          const lower = raw.toLowerCase();
          const networky =
            lower.includes("fetch") ||
            lower.includes("networkerror") ||
            lower.includes("network request failed") ||
            lower.includes("failed to fetch");
          const proxyBackendDown =
            lower.includes("502") ||
            lower.includes("503") ||
            lower.includes("504") ||
            lower.includes("econnrefused") ||
            lower.includes("bad gateway") ||
            lower.includes("socket hang up");
          const hint =
            networky || proxyBackendDown
              ? import.meta.env.DEV &&
                (import.meta.env.VITE_NAKAMA_USE_VITE_PROXY ?? "true").toLowerCase() !== "false"
                ? " — Dev proxy (this page → 127.0.0.1:7350): start Docker Desktop, then from the repo root run `docker compose up -d` and wait until Nakama is healthy. Test: `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7350/healthcheck`"
                : " — Start Docker (`docker compose up -d`). Health: `Invoke-WebRequest -UseBasicParsing http://localhost:7350/healthcheck`"
              : "";
          setErr(raw + hint);
          setConn("disconnected");
        }
      }
    }

    void bootstrap();

    return () => {
      mounted.current = false;
      teardownSocket();
    };
  }, [connectNonce, playerName, refreshRooms, showToast, teardownSocket]);

  const enterMatch = async (id: string, token?: string) => {
    const sock = socketRef.current;
    if (!sock) throw new Error("Not connected");
    setBusy(true);
    setErr(null);
    try {
      const m = token ? await sock.joinMatch(undefined, token) : await sock.joinMatch(id);
      setMatchId(m.match_id);
      setRematchPrompt(null);
      setRematchWaiting(false);
      setScreen("game");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRoom = async () => {
    const s = getSession();
    if (!s) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await callRuntimeRpc(socketRef.current, s, "create_room", { timed: timedMode });
      const body = (res.payload ?? {}) as { match_id?: string; room_code?: string; error?: string };
      if (body.error) throw new Error(body.error);
      if (!body.match_id) throw new Error("No match_id");
      await enterMatch(body.match_id);
    } catch (e) {
      setErr(await formatNakamaError(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePlayVsBot = async () => {
    const s = getSession();
    if (!s) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await callRuntimeRpc(socketRef.current, s, "create_bot_room", { timed: timedMode });
      const body = (res.payload ?? {}) as { match_id?: string; error?: string };
      if (body.error) throw new Error(body.error);
      if (!body.match_id) throw new Error("No match_id");
      await enterMatch(body.match_id);
    } catch (e) {
      setErr(await formatNakamaError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoinById = async () => {
    const raw = joinId.trim();
    if (!raw) return;
    const s = getSession();
    if (!s) return;
    setBusy(true);
    setErr(null);
    try {
      const compact = raw.replace(/\s/g, "");
      if (/^\d{4}$/.test(compact)) {
        const res = await callRuntimeRpc(socketRef.current, s, "room_by_code", { code: compact });
        const body = (res.payload ?? {}) as { match_id?: string; error?: string; detail?: string };
        if (body.error) {
          throw new Error(body.detail || body.error);
        }
        if (!body.match_id) throw new Error("No match for that code");
        await enterMatch(body.match_id);
      } else {
        await enterMatch(raw);
      }
    } catch (e) {
      setErr(await formatNakamaError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFindMatch = async () => {
    const sock = socketRef.current;
    if (!sock) return;
    setBusy(true);
    setErr(null);
    try {
      const timedStr = timedMode ? "1" : "0";
      const ticket = await sock.addMatchmaker(
        "properties.mode:tictactoe",
        2,
        2,
        { mode: "tictactoe", timed: timedStr },
        undefined,
      );
      matchmakerTicketRef.current = ticket.ticket;
    } catch (e) {
      setErr(await formatNakamaError(e));
    } finally {
      setBusy(false);
    }
  };

  const sendMove = async (cell: number) => {
    const sock = socketRef.current;
    if (!sock || !matchId) return;
    const payload = JSON.stringify({ c: cell });
    await sock.sendMatchState(matchId, OpCode.MoveIntent, payload, []);
  };

  const sendRematchRequest = async () => {
    const sock = socketRef.current;
    if (!sock || !matchId) return;
    setRematchWaiting(true);
    try {
      await sock.sendMatchState(matchId, OpCode.PlayAgainRequest, "{}", []);
    } catch {
      setRematchWaiting(false);
      showToast("Could not send play again request");
    }
  };

  const sendRematchAnswer = async (accept: boolean) => {
    const sock = socketRef.current;
    if (!sock || !matchId) return;
    setRematchPrompt(null);
    try {
      await sock.sendMatchState(matchId, OpCode.PlayAgainAnswer, JSON.stringify({ accept }), []);
    } catch {
      showToast("Could not send answer");
      if (!accept) setRematchPrompt(null);
    }
  };

  const statusLine = () => {
    if (!snapshot) return "Syncing…";
    if (snapshot.phase === "waiting") return "Waiting for opponent…";
    if (snapshot.phase === "finished") {
      if (snapshot.draw) return "Draw.";
      const ws = snapshot.winner_seat;
      const seats = snapshot.seat_user_ids;
      const wid = ws !== null ? seats[ws] : null;
      if (wid && wid === userId) return "You win!";
      if (ws !== null) return `${seatDisplayName(snapshot, ws)} wins`;
      return "You lost.";
    }
    const seats = snapshot.seat_user_ids;
    const mySeat = seats[0] === userId ? 0 : seats[1] === userId ? 1 : null;
    if (mySeat === null) return "Spectating";
    const turn = snapshot.current_turn_seat;
    if (turn === null) return "…";
    if (turn === mySeat) return "Your turn";
    return `${seatDisplayName(snapshot, turn)}'s turn`;
  };

  const deadline = snapshot?.timed && snapshot.phase === "playing" ? snapshot.move_deadline_ms : null;
  const countdown = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;

  const localPlayerWon =
    !!snapshot &&
    snapshot.phase === "finished" &&
    !snapshot.draw &&
    snapshot.winner_seat !== null &&
    snapshot.seat_user_ids[snapshot.winner_seat] === userId;

  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setSnapshot((prev) => (prev ? { ...prev } : prev)), 500);
    return () => clearInterval(t);
  }, [deadline]);

  if (!playerName) {
    return (
      <Register
        busy={false}
        error={err}
        returningDevice={hasLinkedDevice()}
        onWipeDeviceAccount={handleWipeLocalAccount}
        onRegistered={async (name) => {
          setErr(null);
          try {
            setStoredDisplayName(name);
            setPlayerName(name);
          } catch (e) {
            setErr(await formatNakamaError(e));
          }
        }}
      />
    );
  }

  if (screen === "leaderboard") {
    return (
      <div className="page">
        <div className="card">
          <h1>Leaderboard</h1>
          <button type="button" className="linkish" onClick={() => setScreen("lobby")}>
            Back
          </button>
          <ol className="lb">
            {lbRows.map((r) => (
              <li key={r.owner_id}>
                <strong>{(r.username && r.username.trim()) || `Player ${r.owner_id.slice(0, 8)}`}</strong> —{" "}
                {r.score} {r.score === 1 ? "win" : "wins"}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  if (screen === "game") {
    return (
      <div className="page">
        <div className="game card">
          <header className="game-head">
            <div>
              <p className="match-players">{snapshot ? matchHeadline(snapshot) : "Match"}</p>
              {snapshot?.room_code ? (
                <p className="room-code-line">
                  Room code <span className="room-code-digits">{snapshot.room_code}</span>
                  <span className="muted small"> — share this with your opponent</span>
                </p>
              ) : (
                <p className="muted small match-id-line">
                  Match id <code className="mid">{matchId}</code>
                </p>
              )}
            </div>
            <div className={`conn ${conn}`}>{conn}</div>
          </header>
          {localPlayerWon ? <WinCelebration /> : <p className="status">{statusLine()}</p>}
          {countdown !== null ? <p className="timer">Time left: {countdown}s</p> : null}
          <Board snapshot={snapshot} myUserId={userId} onCellPress={(c) => void sendMove(c)} disabled={busy} />
          <div className="game-actions">
            <button type="button" className="secondary" onClick={() => void leaveGame()}>
              Leave match
            </button>
            {snapshot?.phase === "finished" ? (
              <button
                type="button"
                className="primary"
                disabled={busy || !!rematchPrompt || rematchWaiting}
                onClick={() => void sendRematchRequest()}
              >
                {rematchWaiting ? "Waiting…" : "Play again"}
              </button>
            ) : null}
          </div>
          {rematchPrompt ? (
            <div className="modal-backdrop" role="presentation">
              <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="rematch-title">
                <p id="rematch-title" className="modal-title">
                  <strong>{rematchPrompt.requester_name}</strong> wants to play again.
                </p>
                <p className="muted small">Do you want to continue?</p>
                <div className="modal-actions">
                  <button type="button" className="primary" onClick={() => void sendRematchAnswer(true)}>
                    Yes
                  </button>
                  <button type="button" className="secondary" onClick={() => void sendRematchAnswer(false)}>
                    No
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {toast ? <div className="toast">{toast}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <span className={`pill ${conn}`}>{conn}</span>
      </div>
      <Lobby
        playerName={playerName}
        onSignOut={handleSignOut}
        timedMode={timedMode}
        onTimedChange={setTimedMode}
        joinId={joinId}
        onJoinIdChange={setJoinId}
        onCreateRoom={() => void handleCreateRoom()}
        onPlayVsBot={() => void handlePlayVsBot()}
        onJoinById={() => void handleJoinById()}
        onFindMatch={() => void handleFindMatch()}
        onRefreshRooms={() => void refreshRooms()}
        onOpenLeaderboard={() => {
          void loadLeaderboard();
          setScreen("leaderboard");
        }}
        onJoinListedRoom={async (id) => {
          setJoinId(id);
          try {
            await enterMatch(id);
          } catch (e) {
            setErr(await formatNakamaError(e));
          }
        }}
        rooms={rooms}
        busy={busy}
        error={err}
        conn={conn}
        onRetryConnect={() => {
          setErr(null);
          setConnectNonce((n) => n + 1);
        }}
      />
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
