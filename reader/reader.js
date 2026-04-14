/**
 * reader.js — Main Reader Orchestrator
 * Routes file formats to appropriate renderers and wires up the UI.
 */

// ─── Global State ───────────────────────────────────────────
let currentBookName = '';
let currentFormat = '';  // 'pdf', 'epub', 'mobi', 'docx'
let currentPage = 1;
let totalPages = 1;
let noteTakingActive = false;

// PDF.js state
let pdfDoc = null;
let pdfScale = 1.5;

// Foliate state
let foliateView = null;

function isFoliateScrolledMode() {
  return foliateView?.renderer?.getAttribute('flow') === 'scrolled';
}

// ─── DOM Elements ───────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const welcomeScreen = document.getElementById('welcome-screen');
const readerContent = document.getElementById('reader-content');
const readerArea = document.getElementById('reader-area');
const loadingOverlay = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingProgressBar = document.getElementById('loading-progress-bar');
const loadingPercent = document.getElementById('loading-percent');
const bookTitle = document.getElementById('book-title');
const pageInfo = document.getElementById('page-info');
const btnNotes = document.getElementById('btn-notes');
const btnSave = document.getElementById('btn-save');
const saveModal = document.getElementById('save-modal');
const modalCancel = document.getElementById('modal-cancel');
const saveNoteCount = document.getElementById('save-note-count');
const toastEl = document.getElementById('toast');

// ─── Toast Helper ───────────────────────────────────────────
function showToast(message, type = '') {
  toastEl.textContent = message;
  toastEl.className = 'toast' + (type ? ' ' + type : '');
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), 3000);
}

function setLoadingProgress(percent, message = 'Loading book...') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  loadingText.textContent = message;
  loadingProgressBar.style.width = `${safePercent}%`;
  loadingPercent.textContent = `${safePercent}%`;
}

function showLoadingOverlay(message = 'Loading book...') {
  setLoadingProgress(0, message);
  loadingOverlay.style.display = 'flex';
}

function hideLoadingOverlay() {
  setLoadingProgress(100, 'Ready');
  loadingOverlay.style.display = 'none';
}

function updateReaderLayoutMode() {
  const isFoliateFormat = currentFormat === 'epub' || currentFormat === 'mobi';
  readerArea.classList.toggle('sidebar-overlay-mode', isFoliateFormat);
}

// ─── File Input Handler ─────────────────────────────────────
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  currentBookName = name.replace(/\.[^/.]+$/, ''); // strip extension

  // Detect format
  const formatMap = {
    'pdf': 'pdf',
    'epub': 'epub',
    'mobi': 'mobi',
    'azw3': 'mobi',  // KF8 uses same parser as MOBI
    'docx': 'docx'
  };

  currentFormat = formatMap[ext];
  if (!currentFormat) {
    showToast('Unsupported format: ' + ext);
    return;
  }

  updateReaderLayoutMode();

  // Show loading, hide welcome
  welcomeScreen.style.display = 'none';
  showLoadingOverlay('Preparing book...');

  // Make reader-content visible early so renderers can measure dimensions
  // (the loading overlay covers it with z-index)
  readerContent.classList.add('active');

  // Update toolbar
  bookTitle.textContent = name;
  btnNotes.style.display = 'inline-flex';
  document.getElementById('btn-snapshot').style.display = 'none';
  btnSave.style.display = 'inline-flex';
  pageInfo.style.display = 'inline-flex';

  try {
    switch (currentFormat) {
      case 'pdf':
        await loadPDF(file);
        break;
      case 'epub':
      case 'mobi':
        await loadFoliate(file, currentFormat);
        break;
      case 'docx':
        await loadDocx(file);
        break;
    }

    // Init highlighting, image capture, and snapshot
    Highlighter.init(currentFormat, () => currentPage);
    ImageCapture.init(() => currentPage);
    Snapshot.init(() => currentPage);

    // Show reader
    hideLoadingOverlay();

  } catch (err) {
    console.error('Failed to load book:', err);
    loadingOverlay.style.display = 'none';
    readerContent.classList.remove('active');
    welcomeScreen.style.display = 'flex';
    showToast('Failed to load: ' + err.message);
  }
});

// ─── PDF Renderer ───────────────────────────────────────────
async function loadPDF(file) {
  setLoadingProgress(5, 'Reading PDF file...');
  const arrayBuffer = await file.arrayBuffer();

  // Dynamically import PDF.js
  setLoadingProgress(12, 'Loading PDF engine...');
  const pdfjsLib = await import(browser.runtime.getURL('lib/pdfjs/pdf.min.mjs'));
  pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  loadingTask.onProgress = ({ loaded = 0, total = 0 }) => {
    if (!total) return;
    const percent = 15 + Math.round((loaded / total) * 20);
    setLoadingProgress(percent, 'Parsing PDF...');
  };
  pdfDoc = await loadingTask.promise;
  totalPages = pdfDoc.numPages;
  currentPage = 1;

  updatePageInfo();

  const container = document.getElementById('pdf-container');
  container.style.display = 'flex';
  container.innerHTML = '';

  // Render all pages
  for (let i = 1; i <= totalPages; i++) {
    setLoadingProgress(35 + Math.round((i - 1) / Math.max(totalPages, 1) * 55), `Rendering PDF page ${i} of ${totalPages}...`);
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: pdfScale });

    // Page wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.page = i;
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    wrapper.appendChild(canvas);

    // Text layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    wrapper.appendChild(textLayerDiv);

    container.appendChild(wrapper);

    // Render canvas
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    // Render text layer for selection
    const textContent = await page.getTextContent();
    renderTextLayer(textContent, textLayerDiv, viewport);
  }

  setLoadingProgress(95, 'Finalizing PDF...');

  // Track current page on scroll
  readerArea.addEventListener('scroll', () => {
    const wrappers = container.querySelectorAll('.pdf-page-wrapper');
    const scrollTop = readerArea.scrollTop + 100;
    for (const w of wrappers) {
      if (w.offsetTop <= scrollTop && w.offsetTop + w.offsetHeight > scrollTop) {
        currentPage = parseInt(w.dataset.page);
        updatePageInfo();
        break;
      }
    }
  });

  // Setup image capture for PDF — click on canvas
  container.addEventListener('dblclick', (e) => {
    if (!ImageCapture.isEnabled) return;
    const wrapper = e.target.closest('.pdf-page-wrapper');
    if (!wrapper) return;
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) return;
    const pg = parseInt(wrapper.dataset.page);

    // Capture the whole page as an image
    const dataUrl = canvas.toDataURL('image/png');
    Sidebar.addImageNote(dataUrl, pg);
  });
}

/**
 * Simple text layer renderer for PDF text selection
 */
function renderTextLayer(textContent, container, viewport) {
  const items = textContent.items;
  for (const item of items) {
    const tx = pdfjsLib_getTransform(item.transform, viewport);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = tx.x + 'px';
    span.style.top = tx.y + 'px';
    span.style.fontSize = tx.fontSize + 'px';
    span.style.fontFamily = item.fontName || 'sans-serif';
    if (tx.width > 0) {
      span.style.width = tx.width + 'px';
      span.style.transform = `scaleX(${tx.scaleX})`;
    }
    container.appendChild(span);
  }
}

function pdfjsLib_getTransform(transform, viewport) {
  // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
  const [a, b, c, d, e, f] = transform;
  const scale = viewport.scale;

  // Calculate position
  const x = e * scale;
  const y = viewport.height - (f * scale);
  const fontSize = Math.sqrt(a * a + b * b) * scale;

  return {
    x: x,
    y: y - fontSize,
    fontSize: fontSize,
    width: 0,
    scaleX: 1
  };
}

// ─── Foliate.js Renderer (EPUB / MOBI / AZW3) ──────────────
async function loadFoliate(file, format) {
  const container = document.getElementById('foliate-container');
  container.style.display = 'block';
  container.innerHTML = '';

  try {
    // Import view.js — registers <foliate-view> custom element
    setLoadingProgress(10, `Loading ${format.toUpperCase()} engine...`);
    await import(browser.runtime.getURL('lib/foliate/view.js'));

    // Create foliate-view and attach it; size it via inline style so
    // container-type:size inside the shadow DOM gets resolved pixel values
    setLoadingProgress(22, `Preparing ${format.toUpperCase()} viewer...`);
    foliateView = document.createElement('foliate-view');
    foliateView.style.cssText = 'display:block; width:100%; height:100%;';
    container.appendChild(foliateView);

    // open() accepts a File directly — it calls makeBook internally
    setLoadingProgress(38, `Opening ${format.toUpperCase()} book...`);
    await foliateView.open(file);

    // Use continuous single-page scrolling instead of spread pagination.
    foliateView.renderer.setAttribute('flow', 'scrolled');
    setLoadingProgress(58, `Configuring ${format.toUpperCase()} layout...`);

    const { book } = foliateView;

    // Initialize from sections, then replace with Foliate location totals
    // as relocate events arrive.
    totalPages = Math.max(1, book.sections?.length || 1);
    currentPage = 1;
    updatePageInfo();

    // Listen for relocation events to track progress
    foliateView.addEventListener('relocate', (e) => {
      const detail = e.detail;
      if (detail?.location && typeof detail.location.current === 'number') {
        currentPage = detail.location.current + 1;
        if (typeof detail.location.total === 'number' && detail.location.total > 0) {
          totalPages = detail.location.total;
        }
      } else if (detail?.section && typeof detail.section.current === 'number') {
        currentPage = detail.section.current + 1;
        if (typeof detail.section.total === 'number' && detail.section.total > 0) {
          totalPages = detail.section.total;
        }
      } else if (detail && typeof detail.fraction === 'number') {
        // Fallback only — Foliate normally provides location/section progress.
        currentPage = Math.max(1, Math.min(totalPages, Math.ceil(detail.fraction * totalPages)));
      }
      updatePageInfo();
    });

    // Helper: attach navigation listeners to an iframe's document.
    // Wheel/keyboard/click events inside iframes do NOT bubble to the parent,
    // so we must listen inside each section document directly.
    const attachIframeNav = (doc) => {
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === ' ') {
          e.preventDefault();
          foliateView.goRight();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault();
          foliateView.goLeft();
        }
      });

      let wheelTimer = null;
      doc.addEventListener('wheel', (e) => {
        e.preventDefault();
        // Debounce: only trigger once per wheel gesture
        if (wheelTimer) return;
        wheelTimer = setTimeout(() => { wheelTimer = null; }, 400);
        if (e.deltaY > 0 || e.deltaX > 0) {
          foliateView.goRight();
        } else if (e.deltaY < 0 || e.deltaX < 0) {
          foliateView.goLeft();
        }
      }, { passive: false });

      // Click left/right zones inside the iframe to navigate
      doc.addEventListener('click', (e) => {
        if (isFoliateScrolledMode()) return;
        if (noteTakingActive) return;
        const w = doc.documentElement.clientWidth;
        if (e.clientX > w * 0.6) {
          foliateView.goRight();
        } else if (e.clientX < w * 0.4) {
          foliateView.goLeft();
        }
      });

      const showIframeSelectionAction = () => {
        if (!Highlighter.isEnabled) return;
        const sel = doc.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) {
          Highlighter.hideContextMenu();
          return;
        }

        const selectedText = sel.toString().replace(/\s+/g, ' ').trim();
        const range = sel.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        const frameEl = doc.defaultView.frameElement;
        const frameRect = frameEl ? frameEl.getBoundingClientRect() : { left: 0, top: 0 };
        const applyHighlight = () => highlightRangeInDoc(doc, range);
        const clearSelection = () => {
          const iframeSel = doc.getSelection();
          if (iframeSel) iframeSel.removeAllRanges();
        };

        Highlighter.showEpubContextMenu(
          frameRect.left + rect.left + rect.width / 2,
          frameRect.top + rect.top,
          selectedText,
          currentPage,
          applyHighlight,
          clearSelection
        );
      };

      doc.addEventListener('mouseup', () => {
        setTimeout(showIframeSelectionAction, 0);
      });

      doc.addEventListener('keyup', () => {
        setTimeout(showIframeSelectionAction, 0);
      });

      doc.addEventListener('selectionchange', () => {
        const sel = doc.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) {
          Highlighter.hideContextMenu();
        }
      });
    };

    /**
     * Apply a yellow <mark> highlight to a pre-captured range inside an iframe doc.
     * Must use doc.createElement so the element belongs to the iframe's realm.
     */
    function highlightRangeInDoc(doc, range) {
      try {
        const createMark = () => {
          const m = doc.createElement('mark');
          m.className = 'ebook-highlight';
          m.style.cssText = 'background:rgba(255,230,0,0.5);border-radius:2px;';
          return m;
        };
        const createdMarks = [];
        if (
          range.startContainer === range.endContainer &&
          range.startContainer.nodeType === Node.TEXT_NODE
        ) {
          const mark = createMark();
          range.surroundContents(mark);
          createdMarks.push(mark);
        } else {
          // Multi-node selection — wrap each text node individually
          const walker = doc.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const nr = doc.createRange();
                nr.selectNodeContents(node);
                return range.compareBoundaryPoints(Range.END_TO_START, nr) < 0 &&
                       range.compareBoundaryPoints(Range.START_TO_END, nr) > 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              }
            }
          );
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          nodes.forEach(textNode => {
            if (!textNode.textContent.trim()) return;
            if (textNode.parentNode?.tagName === 'MARK') return;
            const mark = createMark();
            textNode.parentNode.insertBefore(mark, textNode);
            mark.appendChild(textNode);
            createdMarks.push(mark);
          });
        }
        return createdMarks;
      } catch (err) {
        console.warn('Could not highlight range in epub doc:', err);
      }
      return [];
    }

    // foliate fires 'load' each time a section iframe renders, passing { doc, index }
    foliateView.addEventListener('load', (e) => {
      if (!isFoliateScrolledMode() && typeof e.detail?.index === 'number') {
        currentPage = e.detail.index + 1;
        updatePageInfo();
      }
      if (e.detail?.doc) attachIframeNav(e.detail.doc);
    });

    // Also handle wheel on the outer container (for cases where no iframe is focused)
    let outerWheelTimer = null;
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (outerWheelTimer) return;
      outerWheelTimer = setTimeout(() => { outerWheelTimer = null; }, 400);
      if (e.deltaY > 0 || e.deltaX > 0) {
        foliateView.goRight();
      } else if (e.deltaY < 0 || e.deltaX < 0) {
        foliateView.goLeft();
      }
    }, { passive: false });

    // Outer keyboard navigation (when focus is outside the iframe)
    document.addEventListener('keydown', (e) => {
      if (currentFormat !== 'epub' && currentFormat !== 'mobi') return;
      if (!foliateView) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        foliateView.goRight();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        foliateView.goLeft();
      }
    });

    // Force light color-scheme in each EPUB section iframe so the browser
    // doesn't apply dark-mode defaults (dark bg + light text) when the
    // Force light/white rendering in each EPUB section iframe.
    // 'color-scheme: only light' prevents the browser applying dark-mode UA
    // defaults; explicit background/color prevent the extension's dark theme
    // from bleeding through transparent iframe/shadow-DOM layers.
    foliateView.renderer.setStyles(`
      html, body {
        color-scheme: only light !important;
        background-color: #ffffff !important;
        color: #1a1a1a !important;
      }
    `);
    setLoadingProgress(88, `Finalizing ${format.toUpperCase()} book...`);

    // Ensure we start at the beginning without forcing an extra page turn.
    if (isFoliateScrolledMode()) {
      foliateView.goToFraction(0);
    } else {
      foliateView.renderer.next();
    }

    setLoadingProgress(95, `${format.toUpperCase()} ready...`);

    updatePageInfo();

  } catch (err) {
    console.error('Foliate error:', err);
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <p>Could not render this ${format.toUpperCase()} file.</p>
        <p style="margin-top: 8px; font-size: 13px;">Error: ${err.message}</p>
      </div>
    `;
    throw err;
  }
}

// ─── DOCX Renderer ──────────────────────────────────────────
async function loadDocx(file) {
  setLoadingProgress(8, 'Reading DOCX file...');
  const arrayBuffer = await file.arrayBuffer();
  const container = document.getElementById('docx-container');
  container.style.display = 'block';

  // Convert DOCX to HTML using mammoth.js
  setLoadingProgress(30, 'Converting DOCX to HTML...');
  const result = await mammoth.convertToHtml(
    { arrayBuffer: arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(function (image) {
        return image.read('base64').then(function (imageBuffer) {
          return {
            src: 'data:' + image.contentType + ';base64,' + imageBuffer
          };
        });
      })
    }
  );

  setLoadingProgress(72, 'Rendering DOCX content...');
  container.innerHTML = result.value;

  // Add page markers based on content sections
  // DOCX doesn't have actual pages, so we estimate by content blocks
  assignDocxPages(container);

  // Log any conversion messages
  if (result.messages && result.messages.length > 0) {
    console.log('Mammoth messages:', result.messages);
  }

  // Setup image capture on the container
  ImageCapture.setupListeners(container);
  setLoadingProgress(95, 'Finalizing DOCX...');

  // Track "page" based on scroll position
  readerArea.addEventListener('scroll', () => {
    const scrollFraction = readerArea.scrollTop / (readerArea.scrollHeight - readerArea.clientHeight);
    currentPage = Math.max(1, Math.ceil(scrollFraction * totalPages));
    updatePageInfo();
  });
}

/**
 * Assign page numbers to DOCX content based on estimated content height
 */
function assignDocxPages(container) {
  // Estimate: ~800px of content per "page"
  const pageHeight = 800;
  const contentHeight = container.scrollHeight;
  totalPages = Math.max(1, Math.ceil(contentHeight / pageHeight));
  currentPage = 1;
  updatePageInfo();
}

// ─── Page Info ──────────────────────────────────────────────
function updatePageInfo() {
  if (currentFormat === 'docx') {
    pageInfo.textContent = `Page ${currentPage} / ~${totalPages}`;
  } else if (currentFormat === 'epub' || currentFormat === 'mobi') {
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  } else {
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  }
}

// ─── Take Notes Toggle ─────────────────────────────────────
btnNotes.addEventListener('click', () => {
  noteTakingActive = !noteTakingActive;
  const btnSnapshot = document.getElementById('btn-snapshot');

  if (noteTakingActive) {
    Highlighter.enable();
    ImageCapture.enable();
    Sidebar.open();
    btnSnapshot.style.display = 'inline-flex';
    showToast('Note-taking enabled — highlight text, click images, or use 📷 Snapshot');
  } else {
    Highlighter.disable();
    ImageCapture.disable();
    Sidebar.close();
    btnSnapshot.style.display = 'none';
    // Deactivate snapshot mode if it was running
    if (Snapshot.isActive) Snapshot.deactivate();
  }
});

// ─── Snapshot Button ────────────────────────────────────────
document.getElementById('btn-snapshot').addEventListener('click', () => {
  // Open sidebar if not already open so user sees captured images
  if (!Sidebar.isOpen) {
    Sidebar.open();
  }
  Snapshot.toggle();
});

// ─── Save Notes ─────────────────────────────────────────────
btnSave.addEventListener('click', () => {
  const count = Sidebar.getCount();
  if (count === 0) {
    showToast('No notes to save');
    return;
  }
  saveNoteCount.textContent = count;
  saveModal.classList.add('active');
});

modalCancel.addEventListener('click', () => {
  saveModal.classList.remove('active');
});

document.getElementById('modal-save-docx').addEventListener('click', async () => {
  saveModal.classList.remove('active');
  const notes = Sidebar.getNotes();
  const includePages = document.getElementById('opt-page-numbers').checked;
  await Exporter.exportNotesAsDocx(currentBookName, notes, includePages);
});

document.getElementById('modal-save-pdf').addEventListener('click', async () => {
  saveModal.classList.remove('active');
  const notes = Sidebar.getNotes();
  const includePages = document.getElementById('opt-page-numbers').checked;
  await Exporter.exportNotesAsPdf(currentBookName, notes, includePages);
});

document.getElementById('modal-save-txt').addEventListener('click', () => {
  saveModal.classList.remove('active');
  const notes = Sidebar.getNotes();
  const includePages = document.getElementById('opt-page-numbers').checked;
  Exporter.exportNotesAsTxt(currentBookName, notes, includePages);
});

// Close modal on overlay click
saveModal.addEventListener('click', (e) => {
  if (e.target === saveModal) {
    saveModal.classList.remove('active');
  }
});

// ─── Keyboard Navigation ───────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (currentFormat === 'pdf') {
    // PDF: scroll-based, so keyboard just scrolls
    return;
  }
  if (foliateView) {
    if (e.key === 'ArrowRight') foliateView.next?.();
    if (e.key === 'ArrowLeft') foliateView.prev?.();
  }
});

// ─── Navigate To Page (called by sidebar "Show in Book") ────
function navigateToPage(page) {
  const pageNum = parseInt(page);
  if (isNaN(pageNum) || pageNum < 1) {
    showToast('Cannot navigate to page: ' + page);
    return;
  }

  if (currentFormat === 'pdf') {
    // PDF: scroll to the page wrapper
    const container = document.getElementById('pdf-container');
    const wrapper = container.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
    if (wrapper) {
      const readerArea = document.getElementById('reader-area');
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Flash the page border briefly
      wrapper.style.outline = '3px solid var(--accent)';
      wrapper.style.outlineOffset = '4px';
      wrapper.style.transition = 'outline 0.3s ease';
      setTimeout(() => {
        wrapper.style.outline = '';
        wrapper.style.outlineOffset = '';
      }, 2000);
      currentPage = pageNum;
      updatePageInfo();
      showToast(`Navigated to page ${pageNum}`);
    } else {
      showToast(`Page ${pageNum} not found`);
    }

  } else if (currentFormat === 'epub' || currentFormat === 'mobi') {
    // EPUB/MOBI/AZW3: navigate to approximate generated page progress
    if (foliateView) {
      const fraction = Math.max(0, (pageNum - 1) / Math.max(totalPages - 1, 1));
      if (fraction >= 0) {
        try {
          foliateView.goToFraction(fraction);
          currentPage = pageNum;
          updatePageInfo();
          showToast(`Navigated to page ${pageNum}`);
        } catch (err) {
          console.warn('Navigation error:', err);
          showToast(`Could not navigate to page ${pageNum}`);
        }
      }
    }

  } else if (currentFormat === 'docx') {
    // DOCX: scroll to estimated position
    const readerArea = document.getElementById('reader-area');
    const scrollHeight = readerArea.scrollHeight - readerArea.clientHeight;
    const fraction = Math.max(0, (pageNum - 1) / Math.max(totalPages - 1, 1));
    const scrollTarget = fraction * scrollHeight;
    readerArea.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    currentPage = pageNum;
    updatePageInfo();
    showToast(`Navigated to page ~${pageNum}`);
  }
}

// ─── Window Close / Beforeunload ────────────────────────────
window.addEventListener('beforeunload', (e) => {
  if (Sidebar.getCount() > 0) {
    e.preventDefault();
    e.returnValue = 'You have unsaved notes. Are you sure you want to leave?';
  }
});
