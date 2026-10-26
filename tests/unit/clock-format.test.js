// ABOUTME: Unit tests for formatting durations as countdown clock text.
// ABOUTME: Covers rounding, zero padding and durations above one hour.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {formatCountdown} from '../../src/core/clock-format.js';

test('formats minutes and seconds with zero padding', () => {
    assert.equal(formatCountdown(25 * 60_000), '25:00');
    assert.equal(formatCountdown(65_000), '01:05');
});

test('rounds partial seconds up so the countdown never shows 00:00 early', () => {
    assert.equal(formatCountdown(59_001), '01:00');
    assert.equal(formatCountdown(1), '00:01');
});

test('shows zero for zero or negative durations', () => {
    assert.equal(formatCountdown(0), '00:00');
    assert.equal(formatCountdown(-5000), '00:00');
});

test('keeps counting minutes past one hour', () => {
    assert.equal(formatCountdown(90 * 60_000), '90:00');
});
