document.getElementById('open-reader').addEventListener('click', () => {
  browser.tabs.create({
    url: browser.runtime.getURL('reader/reader.html')
  });
  window.close();
});
