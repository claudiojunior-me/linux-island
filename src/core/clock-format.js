// ABOUTME: Formats millisecond durations as MM:SS countdown text.
// ABOUTME: Rounds up so a countdown reaches 00:00 only when time is truly over.

export function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
