// ABOUTME: Unit tests for the card deck that lets the user page through the island's plugins.
// ABOUTME: Uses a real registry with plain object plugins whose activity the tests switch on and off.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {CardDeck} from '../../src/core/card-deck.js';
import {PluginRegistry} from '../../src/core/plugin-registry.js';

const plugin = (id, {priority = 0, showsWhenIdle = false} = {}) => {
    const p = {
        id,
        priority,
        showsWhenIdle,
        active: false,
        hasActivity: () => p.active,
        handleAction: () => {},
        getState: () => ({}),
    };
    return p;
};

// Registers plugins in the given order, so registration order differs from the deck order in some tests.
function setup(order, plugins) {
    const registry = new PluginRegistry();
    plugins.forEach(p => registry.register(p));
    return {registry, deck: new CardDeck(registry, order)};
}

test('cards follow the deck order, skipping plugins that are not loaded', () => {
    const {deck} = setup(['a', 'b', 'c'], [plugin('c'), plugin('a')]);
    assert.deepEqual(deck.cards().map(p => p.id), ['a', 'c']);
});

test('current is the foreground plugin until the user chooses one', () => {
    const idle = plugin('idle', {showsWhenIdle: true});
    const {deck} = setup(['quiet', 'idle'], [plugin('quiet'), idle]);
    assert.equal(deck.current(), idle);
});

test('current is null when nothing is chosen, active or shown when idle', () => {
    const {deck} = setup(['quiet'], [plugin('quiet')]);
    assert.equal(deck.current(), null);
});

test('next and previous page through every card and wrap around', () => {
    const {deck} = setup(['a', 'b', 'c'], [plugin('a', {showsWhenIdle: true}), plugin('b'), plugin('c')]);
    deck.next();
    assert.equal(deck.current().id, 'b');
    deck.next();
    deck.next();
    assert.equal(deck.current().id, 'a');
    deck.previous();
    assert.equal(deck.current().id, 'c');
});

test('paging starts from the first card when nothing is showing', () => {
    const {deck} = setup(['a', 'b'], [plugin('a'), plugin('b')]);
    deck.next();
    assert.equal(deck.current().id, 'a');
});

test('choose shows the given card', () => {
    const {deck} = setup(['a', 'b'], [plugin('a', {showsWhenIdle: true}), plugin('b')]);
    deck.choose('b');
    assert.equal(deck.current().id, 'b');
});

test('a chosen card stays while lower-priority plugins become active', () => {
    const low = plugin('low', {priority: 1});
    const {deck} = setup(['chosen', 'low'], [plugin('chosen', {priority: 5}), low]);
    deck.choose('chosen');
    low.active = true;
    deck.refresh();
    assert.equal(deck.current().id, 'chosen');
});

test('a higher-priority plugin becoming active takes over a chosen card', () => {
    const high = plugin('high', {priority: 9});
    const {deck} = setup(['chosen', 'high'], [plugin('chosen', {priority: 5}), high]);
    deck.choose('chosen');
    high.active = true;
    deck.refresh();
    assert.equal(deck.current().id, 'high');
});

test('a higher-priority plugin that was already active does not take over', () => {
    const high = plugin('high', {priority: 9});
    high.active = true;
    const {deck} = setup(['chosen', 'high'], [plugin('chosen', {priority: 5}), high]);
    deck.refresh();
    deck.choose('chosen');
    deck.refresh();
    assert.equal(deck.current().id, 'chosen');
});

test('the choice falls back to the foreground when the chosen plugin is unloaded', () => {
    const idle = plugin('idle', {showsWhenIdle: true});
    const {registry, deck} = setup(['idle', 'gone'], [idle, plugin('gone')]);
    deck.choose('gone');
    registry.unregister('gone');
    deck.refresh();
    assert.equal(deck.current(), idle);
});

test('runner-up is the most important visible plugin other than the current card', () => {
    const active = plugin('active', {priority: 9});
    active.active = true;
    const idle = plugin('idle', {showsWhenIdle: true});
    const {deck} = setup(['idle', 'active', 'quiet'], [idle, active, plugin('quiet')]);
    assert.equal(deck.runnerUp(), idle);
    deck.choose('quiet');
    assert.equal(deck.runnerUp(), active);
});

test('runner-up is null when only the current card is visible', () => {
    const {deck} = setup(['idle'], [plugin('idle', {showsWhenIdle: true})]);
    assert.equal(deck.runnerUp(), null);
});
