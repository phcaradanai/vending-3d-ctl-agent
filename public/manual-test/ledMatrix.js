// LED geometry, shared by the manual-test UI and its unit test.
// Physical wiring: LED 1 is the bottom-left corner. Rows are counted from the
// bottom and every row runs left to right — the strip restarts at the left edge
// on each row, it does not snake back (no right-to-left return run).

// Length of the physical strip. The UI matrix can be configured larger, so
// indices above this are drawn as unusable rather than clickable.
export const LED_MAX = 165;

export function ledIndexAt(rowFromBottom, colFromLeft, cols) {
  return (rowFromBottom - 1) * cols + colFromLeft;
}

export function ledPositionOf(index, cols) {
  return {
    rowFromBottom: Math.floor((index - 1) / cols) + 1,
    colFromLeft: ((index - 1) % cols) + 1,
  };
}
