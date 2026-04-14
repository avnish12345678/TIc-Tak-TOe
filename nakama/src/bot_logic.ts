import { applyMove, cellMarkForSeat, checkWinner, isDraw, type Cell } from "./game_logic";

/** Minimax score for bot (seat); 1 win, -1 loss, 0 draw. */
function minimaxScore(board: Cell[], botToMove: boolean, botSeat: 0 | 1): number {
  const botMark = cellMarkForSeat(botSeat);
  const w = checkWinner(board);
  if (w !== 0) return w === botMark ? 1 : -1;
  if (isDraw(board)) return 0;

  if (botToMove) {
    let best = -2;
    for (let c = 0; c < 9; c++) {
      const nb = applyMove(board, c, botSeat);
      if (!nb) continue;
      best = Math.max(best, minimaxScore(nb, false, botSeat));
    }
    return best;
  }
  const opSeat: 0 | 1 = botSeat === 0 ? 1 : 0;
  let best = 2;
  for (let c = 0; c < 9; c++) {
    const nb = applyMove(board, c, opSeat);
    if (!nb) continue;
    best = Math.min(best, minimaxScore(nb, true, botSeat));
  }
  return best;
}

/** Best empty cell for bot (unbeatable on 3×3). Ties broken at random. */
export function pickBotMove(board: Cell[], botSeat: 0 | 1): number {
  const candidates: number[] = [];
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
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}
