import type { BackgroundMessage, BackgroundResponse, ContentMessage, ContentResponse } from './shared/types';

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype = element instanceof HTMLInputElement
    ? window.HTMLInputElement.prototype
    : window.HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(element, value);
    return;
  }

  element.value = value;
}

export function injectText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? element.value.length;
  const hasSelection = start !== end;
  const nextValue = hasSelection
    ? `${element.value.slice(0, start)}${text}${element.value.slice(end)}`
    : text;
  const selectionStart = hasSelection ? start : 0;
  const selectionEnd = selectionStart + text.length;

  setNativeValue(element, nextValue);
  element.setSelectionRange(selectionStart, selectionEnd);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function injectIntoContentEditable(element: HTMLElement, text: string): void {
  element.focus();

  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)
    ? selection.getRangeAt(0)
    : document.createRange();

  if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
    range.selectNodeContents(element);
  }

  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);

  selection?.removeAllRanges();
  selection?.addRange(range);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function getSelectedText(): string {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? start;
    return activeElement.value.slice(start, end);
  }

  return window.getSelection()?.toString() ?? '';
}

// ── Tab-context relay ─────────────────────────────────────────────────────
// When the RyFine web app requests tab context (for example personalisation),
// relay the request to the background and post the response back to the page.
const RYFINE_ORIGINS = ['https://www.ryfine.app', 'http://localhost:5173'];
if (RYFINE_ORIGINS.some((o) => window.location.origin === o || window.location.origin.startsWith(o))) {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'RYFINE_REQUEST_TAB_CONTEXT') return;

    chrome.runtime
      .sendMessage({ type: 'GET_TAB_CONTEXT' } satisfies BackgroundMessage)
      .then((response: BackgroundResponse) => {
        window.postMessage(
          { type: 'RYFINE_TAB_CONTEXT', tabs: response.tabs },
          window.location.origin,
        );
      })
      .catch(() => {
        window.postMessage({ type: 'RYFINE_TAB_CONTEXT', tabs: [] }, window.location.origin);
      });
  });
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTED_TEXT') {
    const response: ContentResponse = {
      type: 'SELECTED_TEXT',
      text: getSelectedText(),
    };
    sendResponse(response);
    return false;
  }

  if (message.type === 'INJECT_TEXT') {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      injectText(activeElement, message.text);
    } else if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
      injectIntoContentEditable(activeElement, message.text);
    } else {
      void navigator.clipboard?.writeText(message.text).catch(() => undefined);
    }

    sendResponse({ type: 'INJECTED' } satisfies ContentResponse);
    return false;
  }

  return false;
});