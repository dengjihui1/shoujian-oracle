import assert from "node:assert/strict";
import test from "node:test";
import { ConversationViewport, isNearConversationBottom } from "../src/conversation-scroll.js";

function viewportElement({ scrollHeight = 1_000, scrollTop = 600, clientHeight = 400 } = {}) {
  return { scrollHeight, scrollTop, clientHeight };
}

test("conversation initially follows the newest message", () => {
  const controller = new ConversationViewport();
  const element = viewportElement({ scrollHeight: 800, scrollTop: 0, clientHeight: 300 });
  controller.restore(element, null, { contentChanged: true });
  assert.equal(element.scrollTop, 800);
  assert.deepEqual(controller.state, { followLatest: true, unread: false });
});

test("manual upward reading is preserved when new content arrives", () => {
  const controller = new ConversationViewport();
  const oldElement = viewportElement({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 400 });
  controller.observeScroll(oldElement);
  const snapshot = controller.capture(oldElement);
  const newElement = viewportElement({ scrollHeight: 1_300, scrollTop: 0, clientHeight: 400 });
  controller.restore(newElement, snapshot, { contentChanged: true });
  assert.equal(newElement.scrollTop, 300);
  assert.deepEqual(controller.state, { followLatest: false, unread: true });
});

test("streaming content marks unread without pulling an upward reader", () => {
  const controller = new ConversationViewport();
  const element = viewportElement({ scrollHeight: 1_000, scrollTop: 100, clientHeight: 400 });
  controller.observeScroll(element);
  controller.contentChanged(element);
  assert.equal(element.scrollTop, 100);
  assert.equal(controller.state.unread, true);
});

test("jumping to latest restores follow mode", () => {
  const controller = new ConversationViewport();
  const element = viewportElement({ scrollHeight: 1_100, scrollTop: 100, clientHeight: 400 });
  controller.observeScroll(element);
  controller.contentChanged(element);
  controller.jumpToLatest(element);
  assert.equal(element.scrollTop, 1_100);
  assert.deepEqual(controller.state, { followLatest: true, unread: false });
  assert.equal(isNearConversationBottom(element), true);
});
