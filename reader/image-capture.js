/**
 * image-capture.js — Image Capture Module
 * Allows clicking on images in eBooks to capture them to the notes sidebar.
 */
const ImageCapture = (() => {
  let enabled = false;
  let getPageFn = null;

  function init(getPageFunc) {
    getPageFn = getPageFunc;
  }

  function enable() {
    enabled = true;
  }

  function disable() {
    enabled = false;
  }

  function getCurrentPage() {
    if (getPageFn) return getPageFn();
    return '?';
  }

  /**
   * Handle click on an image element
   */
  function captureImage(imgElement) {
    if (!enabled) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Use naturalWidth/Height for best quality
      canvas.width = imgElement.naturalWidth || imgElement.width;
      canvas.height = imgElement.naturalHeight || imgElement.height;

      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      const page = getCurrentPage();
      Sidebar.addImageNote(dataUrl, page);
    } catch (e) {
      console.error('Failed to capture image:', e);
      showToast('Could not capture image (cross-origin restriction)');
    }
  }

  /**
   * Capture a region from a PDF canvas
   */
  function capturePDFRegion(canvas, x, y, width, height, page) {
    if (!enabled) return;

    try {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = width;
      captureCanvas.height = height;
      const ctx = captureCanvas.getContext('2d');
      ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
      const dataUrl = captureCanvas.toDataURL('image/png');
      Sidebar.addImageNote(dataUrl, page);
    } catch (e) {
      console.error('Failed to capture PDF region:', e);
    }
  }

  /**
   * Setup image click listeners on a container
   */
  function setupListeners(container) {
    container.addEventListener('click', (e) => {
      if (!enabled) return;

      const img = e.target.closest('img');
      if (img) {
        e.preventDefault();
        e.stopPropagation();
        captureImage(img);
      }
    });
  }

  return {
    init,
    enable,
    disable,
    captureImage,
    capturePDFRegion,
    setupListeners,
    get isEnabled() { return enabled; }
  };
})();
