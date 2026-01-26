// Wrap sidePanel API call to handle potential unavailability or errors
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("setPanelBehavior error:", error));
}

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu item, suppressing error if it already exists
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open Gemini CLI',
    contexts: ['all']
  }, () => {
    if (chrome.runtime.lastError) {
      console.log("Context menu create warning:", chrome.runtime.lastError.message);
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    // Check if sidePanel API is available before calling
    if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: tab.windowId })
            .catch(err => console.error("sidePanel.open error:", err));
    } else {
        console.error("chrome.sidePanel.open is not available.");
    }
  }
});