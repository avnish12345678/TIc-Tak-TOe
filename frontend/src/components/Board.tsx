import type { GameSnapshot } from "../nakama/protocol";

type Props = {
  snapshot: GameSnapshot | null;
  myUserId: string;
  onCellPress: (cell: number) => void;
  disabled: boolean;
};

function markForCell(board: number[], i: number): string {
  const v = board[i];
  if (v === 1) return "X";
  if (v === 2) return "O";
  return "";
}

export function Board({ snapshot, myUserId, onCellPress, disabled }: Props) {
  const board = snapshot?.board ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const seats = snapshot?.seat_user_ids ?? [null, null];
  const mySeat =
    seats[0] === myUserId ? 0 : seats[1] === myUserId ? 1 : null;
  const turn = snapshot?.phase === "playing" ? snapshot.current_turn_seat : null;
  const myTurn = mySeat !== null && turn === mySeat;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Tic tac toe board">
        {board.map((_, i) => {
          const label = markForCell(board, i);
          const empty = board[i] === 0;
          const clickable = empty && myTurn && snapshot?.phase === "playing" && !disabled;
          return (
            <button
              key={i}
              type="button"
              className={`cell ${label ? "filled" : ""} ${clickable ? "clickable" : ""}`}
              disabled={!clickable}
              onClick={() => onCellPress(i)}
              aria-label={label || `Cell ${i + 1}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
