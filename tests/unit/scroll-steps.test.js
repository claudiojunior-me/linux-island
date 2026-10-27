// ABOUTME: Unit tests for turning scroll deltas into whole card steps.
// ABOUTME: Covers wheel notches, small touchpad deltas adding up, and direction changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {ScrollSteps} from '../../src/core/scroll-steps.js';

test('a full notch is one step in its direction', () => {
    const steps = new ScrollSteps();
    assert.equal(steps.add(1), 1);
    assert.equal(steps.add(-1), -1);
});

test('small deltas add up to a step, then gathering starts over', () => {
    const steps = new ScrollSteps();
    assert.equal(steps.add(0.4), 0);
    assert.equal(steps.add(0.4), 0);
    assert.equal(steps.add(0.4), 1);
    assert.equal(steps.add(0.7), 0);
});

test('turning around drops what was gathered in the other direction', () => {
    const steps = new ScrollSteps();
    steps.add(0.9);
    assert.equal(steps.add(-0.5), 0);
    assert.equal(steps.add(-0.5), -1);
});

test('a large delta still moves a single step', () => {
    assert.equal(new ScrollSteps().add(5), 1);
});
