/** HUD counter text in the arcade style: `x03`, `x12`, `x120`. */
export function formatHudCount(count: number): string {
  return `x${String(count).padStart(2, '0')}`;
}
