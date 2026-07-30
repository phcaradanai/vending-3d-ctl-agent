import test from "node:test";
import assert from "node:assert/strict";
import { LED_MAX, ledIndexAt, ledPositionOf } from "../public/manual-test/ledMatrix.js";

test("LED 1 sits at the bottom-left corner", () => {
  assert.equal(ledIndexAt(1, 1, 22), 1);
});

test("every row restarts at the left edge", () => {
  const cols = 22;
  assert.equal(ledIndexAt(1, cols, cols), 22);
  // Row 2 does not snake back: its first LED (23) is on the left edge again.
  assert.equal(ledIndexAt(2, 1, cols), 23);
  assert.equal(ledIndexAt(2, cols, cols), 44);
  assert.equal(ledIndexAt(3, 1, cols), 45);
  assert.equal(ledIndexAt(3, cols, cols), 66);
});

test("indexes cover every cell exactly once", () => {
  for (const cols of [5, 11, 22, 33]) {
    const rows = 5;
    const seen = new Set();
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= cols; col += 1) {
        const index = ledIndexAt(row, col, cols);
        assert.equal(seen.has(index), false, `duplicate index ${index} at ${cols} cols`);
        assert.ok(index >= 1 && index <= rows * cols, `index ${index} out of range`);
        seen.add(index);
      }
    }
    assert.equal(seen.size, rows * cols);
  }
});

test("ledPositionOf is the inverse of ledIndexAt", () => {
  const cols = 22;
  for (let index = 1; index <= 110; index += 1) {
    const { rowFromBottom, colFromLeft } = ledPositionOf(index, cols);
    assert.equal(ledIndexAt(rowFromBottom, colFromLeft, cols), index);
  }
});

test("strip length matches the navigation-light hardware range", () => {
  assert.equal(LED_MAX, 165);
  // 5 rows x 33 cols is the exact-fit matrix for a 165 LED strip.
  assert.equal(ledIndexAt(5, 33, 33), LED_MAX);
});
