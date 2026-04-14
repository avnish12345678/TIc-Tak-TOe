/** Decorative celebration when the local player wins (balloons + confetti + copy). */
export function WinCelebration() {
  return (
    <div className="win-celebration-block" aria-live="polite">
      <div className="win-celebration-bg" aria-hidden="true" />
      <div className="win-confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className={`win-confetti-piece win-confetti-piece--${i % 6}`} />
        ))}
      </div>
      <div className="win-celebration-copy">
        <p className="win-celebration-stars" aria-hidden="true">
          ✨ 🎉 ✨
        </p>
        <h2 className="win-celebration-title">Congratulations!</h2>
        <p className="win-celebration-sub">You won this round</p>
      </div>
      <div className="win-balloons" aria-hidden="true">
        <span className="win-balloon win-balloon--a" />
        <span className="win-balloon win-balloon--b" />
        <span className="win-balloon win-balloon--c" />
        <span className="win-balloon win-balloon--d" />
        <span className="win-balloon win-balloon--e" />
      </div>
    </div>
  );
}
