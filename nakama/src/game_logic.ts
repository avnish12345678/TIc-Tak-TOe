export type Cell = 0 | 1 | 2;

const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Cell[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

export function checkWinner(board: Cell[]): Cell {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== 0 && v === board[b] && v === board[c]) return v;
  }
  return 0;
}

export function isDraw(board: Cell[]): boolean {
  return board.every((c) => c !== 0);
}

export function cellMarkForSeat(seat: 0 | 1): 1 | 2 {
  return seat === 0 ? 1 : 2;
}

export function applyMove(board: Cell[], cell: number, seat: 0 | 1): Cell[] | null {
  if (cell < 0 || cell > 8) return null;
  if (board[cell] !== 0) return null;
  const next = board.slice() as Cell[];
  next[cell] = cellMarkForSeat(seat);
  return next;
}
