export const DEFAULT_BOTTOM_THRESHOLD = 56;

export function isNearConversationBottom(element, threshold = DEFAULT_BOTTOM_THRESHOLD) {
  if (!element) return true;
  const remaining = Number(element.scrollHeight || 0) - Number(element.scrollTop || 0) - Number(element.clientHeight || 0);
  return remaining <= Math.max(0, Number(threshold) || DEFAULT_BOTTOM_THRESHOLD);
}

export class ConversationViewport {
  constructor({ threshold = DEFAULT_BOTTOM_THRESHOLD } = {}) {
    this.threshold = threshold;
    this.followLatest = true;
    this.unread = false;
  }

  capture(element) {
    return element ? { scrollTop: Number(element.scrollTop || 0) } : null;
  }

  observeScroll(element) {
    this.followLatest = isNearConversationBottom(element, this.threshold);
    if (this.followLatest) this.unread = false;
    return this.state;
  }

  restore(element, snapshot, { contentChanged = false } = {}) {
    if (!element) return this.state;
    if (this.followLatest) {
      element.scrollTop = element.scrollHeight;
      this.unread = false;
    } else {
      element.scrollTop = Math.min(snapshot?.scrollTop ?? 0, Math.max(0, element.scrollHeight - element.clientHeight));
      if (contentChanged) this.unread = true;
    }
    return this.state;
  }

  contentChanged(element) {
    if (this.followLatest) {
      if (element) element.scrollTop = element.scrollHeight;
      this.unread = false;
    } else {
      this.unread = true;
    }
    return this.state;
  }

  jumpToLatest(element) {
    this.followLatest = true;
    this.unread = false;
    if (element) element.scrollTop = element.scrollHeight;
    return this.state;
  }

  reset() {
    this.followLatest = true;
    this.unread = false;
  }

  get state() {
    return Object.freeze({ followLatest: this.followLatest, unread: this.unread });
  }
}
