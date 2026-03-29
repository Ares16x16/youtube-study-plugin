import { defineBackground } from 'wxt/utils/define-background';

import { SESSION_ALARM_NAME } from '../../src/shared/constants';
import { addRuntimeMessageListener } from '../../src/shared/chrome';
import type { RuntimeMessage } from '../../src/shared/types';
import { createMessageHandler, handleAlarm, toErrorResponse } from './router';

export default defineBackground({
  type: 'module',
  main() {
    const handleMessage = createMessageHandler();

    void handleAlarm();

    chrome.runtime.onStartup.addListener(() => {
      void handleAlarm();
    });

    chrome.runtime.onInstalled.addListener(() => {
      void handleAlarm();
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === SESSION_ALARM_NAME) {
        void handleAlarm();
      }
    });

    addRuntimeMessageListener((message, _sender, sendResponse) => {
      void handleMessage(message as RuntimeMessage)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse(toErrorResponse(error)));
      return true;
    });
  },
});
