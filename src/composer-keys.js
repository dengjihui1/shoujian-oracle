export function isComposerSendShortcut(event) {
  return event?.key === "Enter"
    && !event.shiftKey
    && !event.isComposing
    && event.keyCode !== 229
    && event.target?.matches?.("textarea");
}

export function preferredComposerSubmitter(form) {
  if (!form) return null;
  return form.querySelector('[data-submit-mode="chat"]:not(:disabled)')
    ?? form.querySelector('button[type="submit"]:not(:disabled)');
}
