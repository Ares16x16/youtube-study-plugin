import type { RuntimeMessage } from './types';

function lastErrorMessage() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return null;
  }
  return chrome.runtime.lastError?.message ?? null;
}

function isContextInvalidatedError(message: string | null): boolean {
  if (!message) {
    return false;
  }
  return message.toLowerCase().includes('extension context invalidated');
}

export function storageGet(
  area: chrome.storage.StorageArea,
  keys?: string | string[] | object | null,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    area.get(keys ?? null, (items) => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(items as Record<string, unknown>);
    });
  });
}

export function storageSet(area: chrome.storage.StorageArea, values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(values, () => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });
}

export function storageRemove(area: chrome.storage.StorageArea, keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    area.remove(keys, () => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });
}

export function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = lastErrorMessage();
        if (error) {
          if (isContextInvalidatedError(error)) {
            resolve({ ok: false, error } as T);
            return;
          }
          reject(new Error(error));
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isContextInvalidatedError(message)) {
        resolve({ ok: false, error: message } as T);
        return;
      }
      reject(error);
    }
  });
}

export function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(tabs);
    });
  });
}

export function createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      resolve();
      return;
    }
    chrome.alarms.create(name, info);
    const error = lastErrorMessage();
    if (error) {
      reject(new Error(error));
      return;
    }
    resolve();
  });
}

export function clearAlarm(name: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      resolve(false);
      return;
    }
    chrome.alarms.clear(name, (wasCleared) => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(wasCleared);
    });
  });
}

export function setBadgeText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.action) {
      resolve();
      return;
    }
    chrome.action.setBadgeText({ text }, () => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });
}

export function setBadgeBackgroundColor(color: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.action) {
      resolve();
      return;
    }
    chrome.action.setBadgeBackgroundColor({ color }, () => {
      const error = lastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });
}

export function addRuntimeMessageListener(
  listener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): () => void {
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
