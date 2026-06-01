import { vi } from 'vitest';

const chromeStub = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    connect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onConnect: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn().mockResolvedValue(undefined),
    onClicked: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

vi.stubGlobal('chrome', chromeStub);
vi.stubGlobal('navigator', {
  ...globalThis.navigator,
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});