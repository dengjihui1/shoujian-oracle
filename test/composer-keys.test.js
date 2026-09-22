import assert from "node:assert/strict";
import test from "node:test";
import { isComposerSendShortcut, preferredComposerSubmitter } from "../src/composer-keys.js";

function event(overrides = {}) {
  return {
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
    target: { matches: (selector) => selector === "textarea:not([data-intake-summary])" },
    ...overrides,
  };
}

test("plain Enter sends from the composer", () => {
  assert.equal(isComposerSendShortcut(event()), true);
});

test("Shift+Enter remains a newline", () => {
  assert.equal(isComposerSendShortcut(event({ shiftKey: true })), false);
});

test("IME composition Enter never submits", () => {
  assert.equal(isComposerSendShortcut(event({ isComposing: true })), false);
  assert.equal(isComposerSendShortcut(event({ keyCode: 229 })), false);
});

test("Enter remains editable inside the intake summary", () => {
  assert.equal(isComposerSendShortcut(event({ target: { matches: () => false } })), false);
});

test("Enter prefers ordinary chat over divination", () => {
  const chat = { id: "chat" };
  const form = { querySelector: (selector) => selector.includes('data-submit-mode="chat"') ? chat : { id: "fallback" } };
  assert.equal(preferredComposerSubmitter(form), chat);
});
