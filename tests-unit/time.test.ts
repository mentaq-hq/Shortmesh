import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock } from '../src/lib/time.ts';

test('a one hour timeline reads as HH:MM:SS', () => {
	assert.equal(formatClock(3600), '01:00:00');
	assert.equal(formatClock(3599), '00:59:59');
	assert.equal(formatClock(0), '00:00:00');
});

test('the playhead keeps sub-second precision without a 60 second rollover', () => {
	assert.equal(formatClock(2.5, 2), '00:00:02.50');
	assert.equal(formatClock(59.999, 2), '00:01:00.00');
});

test('invalid or negative time is clamped for display only', () => {
	assert.equal(formatClock(-4), '00:00:00');
	assert.equal(formatClock(Number.NaN, 2), '00:00:00.00');
});
