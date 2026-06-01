import { beforeEach, describe, expect, it } from 'vitest';
import { getSelectedText, injectText } from '../src/content';

describe('injectText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replaces selected text in a textarea', () => {
    document.body.innerHTML = '<textarea id="t">hello world</textarea>';
    const element = document.getElementById('t') as HTMLTextAreaElement;

    element.focus();
    element.setSelectionRange(0, 5);

    injectText(element, 'boosted');

    expect(element.value).toBe('boosted world');
  });

  it('replaces entire textarea content when nothing is selected', () => {
    document.body.innerHTML = '<textarea id="t">original</textarea>';
    const element = document.getElementById('t') as HTMLTextAreaElement;

    element.focus();
    element.setSelectionRange(8, 8);

    injectText(element, 'replaced');

    expect(element.value).toBe('replaced');
  });

  it('replaces selected text in an input', () => {
    document.body.innerHTML = '<input id="i" value="foo bar" />';
    const element = document.getElementById('i') as HTMLInputElement;

    element.focus();
    element.setSelectionRange(4, 7);

    injectText(element, 'baz');

    expect(element.value).toBe('foo baz');
  });
});

describe('getSelectedText', () => {
  it('returns the window selection as a string', () => {
    document.body.innerHTML = '<p id="p">select me</p>';

    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    expect(getSelectedText()).toBe('select me');
  });

  it('returns empty string when nothing is selected', () => {
    window.getSelection()!.removeAllRanges();

    expect(getSelectedText()).toBe('');
  });
});