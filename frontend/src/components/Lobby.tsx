type Conn = "disconnected" | "connecting" | "connected";

type Props = {
  playerName: string;
  onSignOut: () => void;
  timedMode: boolean;
  onTimedChange: (v: boolean) => void;
  joinId: string;
  onJoinIdChange: (v: string) => void;
  onCreateRoom: () => void;
  onPlayVsBot: () => void;
  onJoinById: () => void;
  onFindMatch: () => void;
  onRefreshRooms: () => void;
  onOpenLeaderboard: () => void;
  onJoinListedRoom: (matchId: string) => void;
  rooms: { match_id: string; size: number; room_code?: string | null }[];
  busy: boolean;
  error: string | null;
  conn: Conn;
  onRetryConnect: () => void;
};

export function Lobby({
  playerName,
  onSignOut,
  timedMode,
  onTimedChange,
  joinId,
  onJoinIdChange,
  onCreateRoom,
  onPlayVsBot,
  onJoinById,
  onFindMatch,
  onRefreshRooms,
  onOpenLeaderboard,
  onJoinListedRoom,
  rooms,
  busy,
  error,
  conn,
  onRetryConnect,
}: Props) {
  const showReconnect = conn !== "connected";

  return (
    <div className="lobby card">
      <h1>Tic-Tac-Toe by MonikaAvnish</h1>
      <p className="muted">Server-authoritative</p>
      <p className="muted small lobby-you">
        Playing as <strong>{playerName}</strong>
        <button
          type="button"
          className="linkish sign-out"
          title="Ends this session. Sign in again on this browser with your name to restore the same player and leaderboard stats."
          onClick={onSignOut}
        >
          Sign out
        </button>
      </p>

      <label className="toggle">
        <input type="checkbox" checked={timedMode} onChange={(e) => onTimedChange(e.target.checked)} />
        <span>Timed mode (30s / move)</span>
      </label>

      {error ? <div className="banner error prewrap">{error}</div> : null}

      {showReconnect ? (
        <div className="retry-row">
          <button type="button" className="primary" disabled={conn === "connecting"} onClick={onRetryConnect}>
            {conn === "connecting" ? "Connecting…" : "Retry connection"}
          </button>
        </div>
      ) : null}

      <div className="btn-row lobby-actions">
        <button type="button" className="primary" disabled={busy} onClick={onCreateRoom}>
          Create room
        </button>
        <button type="button" disabled={busy} onClick={onFindMatch}>
          Find match
        </button>
        <button type="button" className="secondary bot-btn" disabled={busy} onClick={onPlayVsBot} title="Play against Monvish (AI)">
          <span className="bot-icon" aria-hidden="true">
            🤖
          </span>{" "}
          Play with Monvish
        </button>
      </div>

      <div className="join-row">
        <input
          className="input"
          placeholder="4-digit code (e.g. 4821) or match ID"
          autoComplete="off"
          value={joinId}
          onChange={(e) => onJoinIdChange(e.target.value)}
        />
        <button type="button" disabled={busy || !joinId.trim()} onClick={onJoinById}>
          Join
        </button>
      </div>

      <div className="rooms">
        <div className="rooms-head">
          <h2>Open rooms</h2>
          <button type="button" className="linkish" disabled={busy} onClick={onRefreshRooms}>
            Refresh
          </button>
        </div>
        {rooms.length === 0 ? (
          <p className="muted small">No public rooms with 1/2 seats. Create one or use Find match.</p>
        ) : (
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.match_id} className="room-row">
                <div>
                  {r.room_code ? (
                    <>
                      <span className="room-code-digits">{r.room_code}</span>
                      <span className="muted small"> · {r.size}/2</span>
                    </>
                  ) : (
                    <>
                      <code>{r.match_id}</code>
                      <span className="muted small"> · {r.size}/2</span>
                    </>
                  )}
                </div>
                <button type="button" disabled={busy} onClick={() => onJoinListedRoom(r.match_id)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className="linkish full" onClick={onOpenLeaderboard}>
        Leaderboard
      </button>
    </div>
  );
}
