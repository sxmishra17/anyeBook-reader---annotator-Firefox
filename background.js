// Background script for eBook Annotator
// Handles messages and download operations

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'downloadFile') {
    const { blob, filename } = message;
    const url = URL.createObjectURL(blob);
    return browser.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }).then(downloadId => {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { success: true, downloadId };
    }).catch(error => {
      return { success: false, error: error.message };
    });
  }

  if (message.type === 'captureTab') {
    // captureVisibleTab(windowId) screenshots the active tab in the given
    // window. Using sender.tab.windowId ensures we target the reader's own
    // window, not whatever window happens to be focused.
    // Returning a Promise is the correct async pattern for Firefox; using
    // sendResponse + return true can lose the response before it arrives.
    const windowId = sender?.tab?.windowId ?? null;
    return browser.tabs.captureVisibleTab(windowId, { format: 'png' })
      .then(dataUrl => ({ dataUrl }))
      .catch(err => {
        console.error('captureVisibleTab failed:', err);
        return { error: err.message };
      });
  }
});
