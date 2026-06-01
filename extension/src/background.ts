import { ryFine } from '@ryfine/core/ryFine';
import { PROVIDERS } from '@ryfine/core/providers';
import { getApiKey, getSettings } from './shared/storage';
import type { BackgroundMessage, BackgroundResponse, ContentMessage, ExtensionBoostRequest, PortBoostRequest, PortBoostResponse, TabInfo } from './shared/types';

const CONTEXT_MENU_ID = 'ryfine-boost';

function providerRequiresKey(providerId: PortBoostRequest['request']['provider']): boolean {
  return PROVIDERS.find((provider) => provider.id === providerId)?.requiresKey ?? false;
}

function runBoost(
  request: ExtensionBoostRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
) {
  return ryFine(request, onChunk, signal);
}

function clearBadgeLater(tabId: number, delayMs: number): void {
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '', tabId });
  }, delayMs);
}

async function registerContextMenu(): Promise<void> {
  try {
    await chrome.contextMenus.removeAll();
  } catch {
    // Ignore remove failures when the menu is not present.
  }

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Boost with RyFine',
    contexts: ['selection'],
  });
}

async function runContextMenuBoost(selectionText: string, tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ text: '...', tabId });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280', tabId });

  try {
    const settings = await getSettings();

    if (settings.provider === 'browserai') {
      throw new Error('This provider is not available in the extension.');
    }

    const apiKey = getApiKey(settings);
    if (providerRequiresKey(settings.provider) && !apiKey.trim()) {
      throw new Error(`No credential configured for ${settings.provider}.`);
    }

    let output = '';
    await runBoost(
      {
        promptText: selectionText,
        provider: settings.provider,
        model: settings.model,
        apiKey,
        agent: settings.agent,
        customInstructions: settings.customInstructions || undefined,
      },
      (chunk) => {
        output += chunk;
      },
    );

    const message: ContentMessage = { type: 'INJECT_TEXT', text: output };
    await chrome.tabs.sendMessage(tabId, message);

    await chrome.action.setBadgeText({ text: 'OK', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    clearBadgeLater(tabId, 2000);
  } catch (error) {
    console.error('[RyFine extension] Context menu boost failed.', error);
    await chrome.action.setBadgeText({ text: 'ERR', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
    clearBadgeLater(tabId, 3000);
  }
}

void registerContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  void registerContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText || !tab?.id) {
    return;
  }

  void runContextMenuBoost(info.selectionText, tab.id);
});

// Allow ryfine.app to request open-tab titles for example personalisation.
// The web page sends window.postMessage → content script → this handler.
chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  if (message.type !== 'GET_TAB_CONTEXT') return false;

  void chrome.tabs
    .query({ currentWindow: true })
    .then((tabs) => {
      const tabInfos: TabInfo[] = tabs
        .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'))
        .map((t) => ({ title: t.title, url: t.url }))
        .slice(0, 10);
      sendResponse({ type: 'TAB_CONTEXT', tabs: tabInfos } satisfies BackgroundResponse);
    })
    .catch(() => {
      sendResponse({ type: 'TAB_CONTEXT', tabs: [] } satisfies BackgroundResponse);
    });

  return true; // keep message channel open for async response
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'boost') {
    return;
  }

  let controller: AbortController | null = null;
  let portConnected = true;
  let activeRequestId = 0;

  function safePostMessage(requestId: number, payload: PortBoostResponse): void {
    if (!portConnected || requestId !== activeRequestId) {
      return;
    }

    try {
      port.postMessage(payload);
    } catch {
      // Ignore post failures when the popup disconnected mid-stream.
    }
  }

  port.onDisconnect.addListener(() => {
    portConnected = false;
    controller?.abort();
    controller = null;
  });

  port.onMessage.addListener((message: PortBoostRequest) => {
    if (message.type !== 'START') {
      return;
    }

    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    const requestId = ++activeRequestId;

    if (message.request.provider === 'browserai') {
      safePostMessage(requestId, {
        type: 'ERROR',
        error: 'This provider is not available in the extension.',
      } satisfies PortBoostResponse);
      return;
    }

    void runBoost(
      message.request,
      (chunk) => {
        safePostMessage(requestId, { type: 'CHUNK', text: chunk } satisfies PortBoostResponse);
      },
      requestController.signal,
    )
      .then((tokenUsage) => {
        if (requestController.signal.aborted) {
          return;
        }

        safePostMessage(requestId, { type: 'DONE', tokenUsage } satisfies PortBoostResponse);
      })
      .catch((error: unknown) => {
        if (requestController.signal.aborted) {
          return;
        }

        safePostMessage(requestId, {
          type: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        } satisfies PortBoostResponse);
      });
  });
});
