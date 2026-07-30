// Serpentine LED geometry, shared by the manual-test UI and its unit test.
// Physical wiring: LED 1 is the bottom-left corner. Rows are counted from the
// bottom; odd rows run left to right, even rows run right to left.

// Length of the physical strip. The UI matrix can be configured larger, so
// indices above this are drawn as unusable rather than clickable.
export const LED_MAX = 165;

export function ledIndexAt(rowFromBottom, colFromLeft, cols) {
  const offset = rowFromBottom % 2 === 1 ? colFromLeft : cols - colFromLeft + 1;
  return (rowFromBottom - 1) * cols + offset;
}

export function ledPositionOf(index, cols) {
  const rowFromBottom = Math.floor((index - 1) / cols) + 1;
  const offset = ((index - 1) % cols) + 1;
  const colFromLeft = rowFromBottom % 2 === 1 ? offset : cols - offset + 1;
  return { rowFromBottom, colFromLeft };
}
