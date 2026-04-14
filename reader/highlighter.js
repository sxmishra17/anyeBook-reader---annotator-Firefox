/**
 * highlighter.js — Text Highlighting Engine
 * Handles highlighting selected text across PDF, DOCX, and EPUB/MOBI formats.
 * Highlighted text is automatically sent to the sidebar as notes with page numbers.
 */
const Highlighter = (() => {
  let noteTakingEnabled = false;
  let currentFormat = null; // 'pdf', 'epub', 'docx'
  let getPageFn = null; // function that returns current page number
  let pendingSelection = null;

  const contextMenu = document.getElementById('context-menu');
  const ctxHighlight = document.getElementById('ctx-highlight');

  function init(format, getPageFunc) {
    currentFormat = format;
    getPageFn = getPageFunc;
  }

  function enable() {
    noteTakingEnabled = true;
  }

  function disable() {
    noteTakingEnabled = false;
    clearPendingSelection();
    hideContextMenu();
  }

  function getCurrentPage() {
    if (getPageFn) return getPageFn();
    return '?';
  }

  /**
   * Get the selected text from the correct context
   */
  function getSelection() {
    if (currentFormat === 'pdf' || currentFormat === 'docx') {
      return window.getSelection();
    }
    // For foliate-js, we need to get selection from internal view
    return window.getSelection();
  }

  /**
   * Extract text from a selection range, ensuring spaces between
   * text from different lines/elements (sel.toString() often merges them).
   */
  function extractTextFromSelection(sel) {
    if (!sel || sel.rangeCount === 0) return '';

    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();

    // Walk all text nodes in the fragment
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent;
      if (text.trim()) {
        parts.push(text.trim());
      }
    }

    // Join with spaces — this prevents "lastwordfirstword" across lines
    return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Highlight text and copy to notes
   */
  function highlightSelection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const text = extractTextFromSelection(sel);
    if (!text) return;
    const page = getCurrentPage();
    let createdHighlights = [];

    // Apply visual highlight
    if (currentFormat === 'docx') {
      createdHighlights = highlightDOMSelection(sel) || [];
    } else if (currentFormat === 'pdf') {
      createdHighlights = highlightPDFSelection(sel, page) || [];
    }
    // For epub/mobi, highlighting is handled by foliate-js overlayer

    // Add to sidebar
    const noteId = Sidebar.addTextNote(text, page);
    attachNoteIdToHighlights(createdHighlights, noteId);

    // Clear selection
    sel.removeAllRanges();
  }

  function highlightDOMRange(range) {
    if (!range) return;

    try {
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        const mark = document.createElement('mark');
        mark.className = 'ebook-highlight';
        range.surroundContents(mark);
        return [mark];
      } else {
        return highlightComplexRange(range);
      }
    } catch (e) {
      console.warn('Could not apply highlight:', e);
    }
    return [];
  }

  /**
   * Highlight a DOM selection by wrapping in <mark> tags (for DOCX/HTML content)
   */
  function highlightDOMSelection(sel) {
    if (sel.rangeCount === 0) return;

    return highlightDOMRange(sel.getRangeAt(0));
  }

  /**
   * Handle complex range highlighting (spans multiple elements)
   */
  function highlightComplexRange(range) {
    const treeWalker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                 range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    while (treeWalker.nextNode()) {
      textNodes.push(treeWalker.currentNode);
    }

    const createdMarks = [];

    textNodes.forEach(textNode => {
      if (textNode.textContent.trim() === '') return;

      const mark = document.createElement('mark');
      mark.className = 'ebook-highlight';
      const parent = textNode.parentNode;

      // Don't double-wrap marks
      if (parent.tagName === 'MARK' && parent.className === 'ebook-highlight') return;

      parent.insertBefore(mark, textNode);
      mark.appendChild(textNode);
      createdMarks.push(mark);
    });

    return createdMarks;
  }

  /**
   * Highlight PDF selection (overlay approach — colored divs over text layer)
   */
  function highlightPDFSelection(sel, page) {
    if (sel.rangeCount === 0) return;

    return highlightPDFRange(sel.getRangeAt(0), page);
  }

  function highlightPDFRange(range, page) {
    if (!range) return;

    const rects = range.getClientRects();
    const createdHighlights = [];

    // Find the page wrapper closest to the selection
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      // Find the pdf-page-wrapper that contains this rect
      const pageWrapper = findPDFPageWrapper(rect);
      if (!pageWrapper) continue;

      const wrapperRect = pageWrapper.getBoundingClientRect();
      const highlightDiv = document.createElement('div');
      highlightDiv.className = 'pdf-highlight-overlay';
      highlightDiv.style.cssText = `
        position: absolute;
        left: ${rect.left - wrapperRect.left}px;
        top: ${rect.top - wrapperRect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background: rgba(255, 230, 0, 0.3);
        pointer-events: none;
        border-radius: 2px;
        mix-blend-mode: multiply;
      `;
      pageWrapper.appendChild(highlightDiv);
      createdHighlights.push(highlightDiv);
    }

    return createdHighlights;
  }

  function attachNoteIdToHighlights(elements, noteId) {
    if (!noteId || !elements?.length) return;
    elements.forEach(el => {
      if (el?.dataset) el.dataset.noteId = noteId;
    });
  }

  function removeHighlightsForNote(noteId) {
    if (!noteId) return;

    document.querySelectorAll(`[data-note-id="${noteId}"]`).forEach(el => {
      if (el.classList.contains('pdf-highlight-overlay')) {
        el.classList.add('highlight-disabled');
      } else if (el.tagName === 'MARK') {
        el.classList.add('highlight-disabled');
      } else {
        el.classList.add('highlight-disabled');
      }
    });

    document.querySelectorAll('#foliate-container iframe').forEach(frame => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.querySelectorAll(`[data-note-id="${noteId}"]`).forEach(el => {
        el.classList.add('highlight-disabled');
      });
    });
  }

  function restoreHighlightsForNote(noteId) {
    if (!noteId) return;

    document.querySelectorAll(`[data-note-id="${noteId}"]`).forEach(el => {
      el.classList.remove('highlight-disabled');
    });

    document.querySelectorAll('#foliate-container iframe').forEach(frame => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.querySelectorAll(`[data-note-id="${noteId}"]`).forEach(el => {
        el.classList.remove('highlight-disabled');
      });
    });
  }

  function findPDFPageWrapper(rect) {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    for (const wrapper of wrappers) {
      const wr = wrapper.getBoundingClientRect();
      if (rect.top >= wr.top && rect.bottom <= wr.bottom) {
        return wrapper;
      }
    }
    // Fallback to closest
    return wrappers.length > 0 ? wrappers[0] : null;
  }

  // ─── Context Menu Handling ────────────────────────────────
  function clearPendingSelection() {
    pendingSelection = null;
  }

  function showActionAt(x, y) {
    const menuWidth = 220;
    const menuHeight = 46;
    const left = Math.max(12, Math.min(x - menuWidth / 2, window.innerWidth - menuWidth - 12));
    const top = y < 64
      ? Math.max(12, y + 18)
      : Math.max(12, y - menuHeight - 12);
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.classList.add('visible');
  }

  function showSelectionAction(selectionData) {
    if (!noteTakingEnabled || !selectionData?.text) return;
    pendingSelection = selectionData;
    showActionAt(selectionData.x, selectionData.y);
  }

  // Called from inside an EPUB/MOBI iframe. applyHighlightFn inserts <mark>
  // into the iframe DOM; clearSelectionFn removes the iframe selection.
  function showEpubContextMenu(x, y, text, page, applyHighlightFn, clearSelectionFn) {
    if (!noteTakingEnabled || !text) return;
    showSelectionAction({
      x,
      y,
      text,
      page,
      applyHighlight: applyHighlightFn || null,
      clearSelection: clearSelectionFn || null,
      source: 'epub'
    });
  }

  function captureDocumentSelection() {
    if (!noteTakingEnabled || (currentFormat !== 'pdf' && currentFormat !== 'docx')) {
      return;
    }

    const sel = getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) {
      hideContextMenu();
      clearPendingSelection();
      return;
    }

    const text = extractTextFromSelection(sel);
    if (!text) {
      hideContextMenu();
      clearPendingSelection();
      return;
    }

    const page = getCurrentPage();
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    const applyHighlight = currentFormat === 'docx'
      ? () => highlightDOMRange(range)
      : () => highlightPDFRange(range, page);

    showSelectionAction({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text,
      page,
      applyHighlight,
      clearSelection: () => {
        const liveSel = getSelection();
        if (liveSel) liveSel.removeAllRanges();
      },
      source: currentFormat
    });
  }

  function hideContextMenu() {
    contextMenu.classList.remove('visible');
  }

  function commitPendingSelection() {
    if (!pendingSelection) return;

    const { applyHighlight, text, page, clearSelection } = pendingSelection;
    const createdHighlights = applyHighlight ? (applyHighlight() || []) : [];
    const noteId = Sidebar.addTextNote(text, page);
    attachNoteIdToHighlights(createdHighlights, noteId);
    if (clearSelection) clearSelection();
    clearPendingSelection();
    hideContextMenu();
  }

  // Floating selection action
  ctxHighlight.addEventListener('click', () => {
    commitPendingSelection();
  });

  document.addEventListener('mouseup', () => {
    setTimeout(captureDocumentSelection, 0);
  });

  document.addEventListener('keyup', () => {
    setTimeout(captureDocumentSelection, 0);
  });

  // Hide action on click elsewhere; also clear pending selection state.
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
      clearPendingSelection();
    }
  });

  document.addEventListener('scroll', () => {
    hideContextMenu();
    clearPendingSelection();
  }, true);

  document.addEventListener('selectionchange', () => {
    if (currentFormat !== 'pdf' && currentFormat !== 'docx') return;
    const sel = getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) {
      hideContextMenu();
      clearPendingSelection();
    }
  });

  // Ctrl+M handler
  document.addEventListener('keydown', (e) => {
    if (!noteTakingEnabled) return;
    if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      highlightSelection();
    }
  });

  return {
    init,
    enable,
    disable,
    highlightSelection,
    showEpubContextMenu,
    hideContextMenu,
    removeHighlightsForNote,
    restoreHighlightsForNote,
    get isEnabled() { return noteTakingEnabled; }
  };
})();
