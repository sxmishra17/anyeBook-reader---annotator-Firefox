/**
 * sidebar.js — Notes Sidebar Manager
 * Manages notes panel with undo stack, drag-to-reorder, context menu
 * (Show in Book, Move Up, Move Down, Delete).
 */
const Sidebar = (() => {
  /** @type {{type: 'text'|'image', content: string, page: number|string, id: string}[]} */
  let notes = [];
  let isOpen = false;

  // Undo / Redo stacks — each entry: { action, data }
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 30;

  // Currently right-clicked note ID
  let contextTargetNoteId = null;

  // Drag state
  let draggedNoteId = null;

  // DOM refs
  const sidebar = document.getElementById('sidebar');
  const notesList = document.getElementById('notes-list');
  const emptyNotes = document.getElementById('empty-notes');
  const noteCount = document.getElementById('note-count');
  const btnNotes = document.getElementById('btn-notes');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClearNotes = document.getElementById('btn-clear-notes');
  const readerArea = document.getElementById('reader-area');

  // Notes context menu
  const notesCtxMenu = document.getElementById('notes-context-menu');
  const ctxShowInBook = document.getElementById('ctx-show-in-book');
  const ctxMoveUp = document.getElementById('ctx-move-up');
  const ctxMoveDown = document.getElementById('ctx-move-down');
  const ctxDeleteNote = document.getElementById('ctx-delete-note');

  // ─── Helpers ──────────────────────────────────────────────
  function generateId() {
    return 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getNoteIndex(id) {
    return notes.findIndex(n => n.id === id);
  }

  // ─── Undo System ──────────────────────────────────────────
  function pushUndo(action, data) {
    undoStack.push({ action, data });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    // New user action clears redo stack
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
  }

  function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack.pop();

    switch (entry.action) {
      case 'add': {
        const id = entry.data.id;
        const idx = getNoteIndex(id);
        const removedNote = idx >= 0 ? { ...notes[idx] } : null;
        notes = notes.filter(n => n.id !== id);
        Highlighter?.removeHighlightsForNote?.(id);
        // Push reverse action to redo
        if (removedNote) redoStack.push({ action: 'delete', data: { note: removedNote, index: idx } });
        renderAll();
        updateCount();
        showToast('Undo: note removed');
        break;
      }
      case 'delete': {
        const { note, index } = entry.data;
        notes.splice(index, 0, note);
        Highlighter?.restoreHighlightsForNote?.(note.id);
        redoStack.push({ action: 'add', data: { id: note.id } });
        renderAll();
        updateCount();
        showToast('Undo: note restored');
        break;
      }
      case 'move': {
        const { id, fromIndex, toIndex } = entry.data;
        const currentIdx = notes.findIndex(n => n.id === id);
        if (currentIdx >= 0) {
          const [note] = notes.splice(currentIdx, 1);
          notes.splice(fromIndex, 0, note);
          redoStack.push({ action: 'move', data: { id, fromIndex: currentIdx, toIndex: fromIndex } });
          renderAll();
          highlightNote(id);
        }
        showToast('Undo: note moved back');
        break;
      }
      case 'clear': {
        const restoredNotes = entry.data.notes;
        redoStack.push({ action: 'clear', data: { notes: [] } });
        notes = [...restoredNotes];
        restoredNotes.forEach(note => Highlighter?.restoreHighlightsForNote?.(note.id));
        renderAll();
        updateCount();
        showToast('Undo: all notes restored');
        break;
      }
    }

    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop();

    switch (entry.action) {
      case 'add': {
        // Redo an add-undo means re-remove the note
        const id = entry.data.id;
        const idx = getNoteIndex(id);
        const removedNote = idx >= 0 ? { ...notes[idx] } : null;
        notes = notes.filter(n => n.id !== id);
        Highlighter?.removeHighlightsForNote?.(id);
        if (removedNote) undoStack.push({ action: 'add', data: { id } });
        renderAll();
        updateCount();
        showToast('Redo: note removed');
        break;
      }
      case 'delete': {
        // Redo a delete-undo means re-insert the note
        const { note, index } = entry.data;
        notes.splice(index, 0, note);
        Highlighter?.restoreHighlightsForNote?.(note.id);
        undoStack.push({ action: 'delete', data: { note: { ...note }, index } });
        renderAll();
        updateCount();
        showToast('Redo: note restored');
        break;
      }
      case 'move': {
        const { id, fromIndex, toIndex } = entry.data;
        const currentIdx = notes.findIndex(n => n.id === id);
        if (currentIdx >= 0) {
          const [note] = notes.splice(currentIdx, 1);
          notes.splice(fromIndex, 0, note);
          undoStack.push({ action: 'move', data: { id, fromIndex: currentIdx, toIndex: fromIndex } });
          renderAll();
          highlightNote(id);
        }
        showToast('Redo: note moved');
        break;
      }
      case 'clear': {
        undoStack.push({ action: 'clear', data: { notes: [...notes] } });
        notes.forEach(note => Highlighter?.removeHighlightsForNote?.(note.id));
        notes = [];
        renderAll();
        updateCount();
        showToast('Redo: all notes cleared');
        break;
      }
    }

    updateUndoRedoButtons();
  }

  // ─── Toggle / Open / Close ────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    sidebar.classList.toggle('open', isOpen);
    readerArea.classList.toggle('sidebar-open', isOpen);
    btnNotes.classList.toggle('active', isOpen);
  }

  function open() {
    if (!isOpen) toggle();
  }

  function close() {
    if (isOpen) toggle();
  }

  // ─── Add Notes ────────────────────────────────────────────
  function addTextNote(text, page) {
    const note = {
      type: 'text',
      content: text.trim(),
      page: page,
      id: generateId()
    };
    notes.push(note);
    pushUndo('add', { id: note.id });
    renderNote(note);
    updateCount();
    showToast(`Note added from page ${page}`);
    return note.id;
  }

  function addImageNote(dataUrl, page) {
    const note = {
      type: 'image',
      content: dataUrl,
      page: page,
      id: generateId()
    };
    notes.push(note);
    pushUndo('add', { id: note.id });
    renderNote(note);
    updateCount();
    showToast(`Image captured from page ${page}`);
    return note.id;
  }

  // ─── Remove / Clear ──────────────────────────────────────
  function removeNote(id) {
    const index = getNoteIndex(id);
    if (index < 0) return;
    const note = notes[index];
    pushUndo('delete', { note: { ...note }, index });
    notes.splice(index, 1);
    Highlighter?.removeHighlightsForNote?.(id);
    const el = document.getElementById(id);
    if (el) {
      el.style.animation = 'slideIn 0.2s ease reverse';
      setTimeout(() => el.remove(), 200);
    }
    updateCount();
    if (notes.length === 0) {
      emptyNotes.style.display = 'flex';
    }
  }

  function clearAll() {
    if (notes.length === 0) return;
    if (!confirm('Clear all notes?')) return;
    pushUndo('clear', { notes: [...notes] });
    notes.forEach(note => Highlighter?.removeHighlightsForNote?.(note.id));
    notes = [];
    renderAll();
    updateCount();
  }

  // ─── Move Notes ───────────────────────────────────────────
  function moveNote(id, direction) {
    const index = getNoteIndex(id);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= notes.length) return;

    pushUndo('move', { id, fromIndex: index, toIndex: newIndex });
    const [note] = notes.splice(index, 1);
    notes.splice(newIndex, 0, note);
    renderAll();
    highlightNote(id);
  }

  function moveNoteToIndex(id, newIndex) {
    const oldIndex = getNoteIndex(id);
    if (oldIndex < 0 || oldIndex === newIndex) return;

    pushUndo('move', { id, fromIndex: oldIndex, toIndex: newIndex });
    const [note] = notes.splice(oldIndex, 1);
    // Adjust index if we removed before the target
    const adjustedIndex = oldIndex < newIndex ? newIndex - 1 : newIndex;
    notes.splice(adjustedIndex, 0, note);
    renderAll();
    highlightNote(id);
  }

  function highlightNote(id) {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('note-moved');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => el.classList.remove('note-moved'), 600);
      }
    });
  }

  // ─── Render ───────────────────────────────────────────────
  function renderNote(note) {
    emptyNotes.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'note-item';
    div.id = note.id;
    div.draggable = true;
    div.style.paddingLeft = '26px'; // room for drag handle

    const dragHandle = `<div class="note-drag-handle" title="Drag to reorder">⠿</div>`;
    const deleteBtn = `<button class="note-delete" data-id="${note.id}" title="Delete note">✕</button>`;

    if (note.type === 'text') {
      div.innerHTML = `
        ${dragHandle}
        ${deleteBtn}
        <div class="note-text">• ${escapeHtml(note.content)}</div>
        <span class="note-page">[Page ${note.page}]</span>
      `;
    } else {
      div.innerHTML = `
        ${dragHandle}
        ${deleteBtn}
        <img class="note-image" src="${note.content}" alt="Captured image">
        <span class="note-page">[Page ${note.page}]</span>
      `;
    }

    div.querySelector('.note-delete').addEventListener('click', () => removeNote(note.id));

    // ─── Drag Events on this note ─────────────────────
    div.addEventListener('dragstart', (e) => {
      draggedNoteId = note.id;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', note.id);
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      draggedNoteId = null;
      // Clean up all drag-over classes
      notesList.querySelectorAll('.drag-over, .drag-over-below').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-below');
      });
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedNoteId === note.id) return;
      e.dataTransfer.dropEffect = 'move';
      // Determine if cursor is in top or bottom half
      const rect = div.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      div.classList.remove('drag-over', 'drag-over-below');
      if (e.clientY < midY) {
        div.classList.add('drag-over');
      } else {
        div.classList.add('drag-over-below');
      }
    });

    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over', 'drag-over-below');
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over', 'drag-over-below');
      if (!draggedNoteId || draggedNoteId === note.id) return;

      const rect = div.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const targetIndex = getNoteIndex(note.id);
      const dropAfter = e.clientY >= midY;

      moveNoteToIndex(draggedNoteId, dropAfter ? targetIndex + 1 : targetIndex);
      draggedNoteId = null;
    });

    notesList.appendChild(div);
    notesList.scrollTop = notesList.scrollHeight;
  }

  function renderAll() {
    notesList.querySelectorAll('.note-item').forEach(el => el.remove());
    if (notes.length === 0) {
      emptyNotes.style.display = 'flex';
    } else {
      emptyNotes.style.display = 'none';
      notes.forEach(note => renderNote(note));
    }
  }

  function updateCount() {
    noteCount.textContent = notes.length;
  }

  function getNotes() {
    return [...notes];
  }

  function getNoteById(id) {
    return notes.find(n => n.id === id) || null;
  }

  function getCount() {
    return notes.length;
  }

  // ─── Notes Context Menu ───────────────────────────────────
  function showNotesContextMenu(e, noteId) {
    e.preventDefault();
    e.stopPropagation();
    contextTargetNoteId = noteId;

    // Disable move up/down if at boundary
    const idx = getNoteIndex(noteId);
    ctxMoveUp.disabled = idx <= 0;
    ctxMoveUp.style.opacity = idx <= 0 ? '0.4' : '1';
    ctxMoveDown.disabled = idx >= notes.length - 1;
    ctxMoveDown.style.opacity = idx >= notes.length - 1 ? '0.4' : '1';

    // Position
    const menuW = 180;
    const menuH = 160;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;

    notesCtxMenu.style.left = x + 'px';
    notesCtxMenu.style.top = y + 'px';
    notesCtxMenu.classList.add('visible');
  }

  function hideNotesContextMenu() {
    notesCtxMenu.classList.remove('visible');
    contextTargetNoteId = null;
  }

  // ─── Event Listeners ──────────────────────────────────────

  // Right-click on note
  notesList.addEventListener('contextmenu', (e) => {
    const noteItem = e.target.closest('.note-item');
    if (!noteItem) return;
    showNotesContextMenu(e, noteItem.id);
  });

  // "Delete Note"
  ctxDeleteNote.addEventListener('click', () => {
    if (contextTargetNoteId) {
      removeNote(contextTargetNoteId);
      showToast('Note deleted');
    }
    hideNotesContextMenu();
  });

  // "Show in Book"
  ctxShowInBook.addEventListener('click', () => {
    if (contextTargetNoteId) {
      const note = getNoteById(contextTargetNoteId);
      if (note) {
        const el = document.getElementById(contextTargetNoteId);
        if (el) {
          el.style.outline = '2px solid var(--accent)';
          el.style.outlineOffset = '2px';
          setTimeout(() => {
            el.style.outline = '';
            el.style.outlineOffset = '';
          }, 1500);
        }
        if (typeof navigateToPage === 'function') {
          navigateToPage(note.page);
        }
      }
    }
    hideNotesContextMenu();
  });

  // "Move Up"
  ctxMoveUp.addEventListener('click', () => {
    if (contextTargetNoteId) {
      moveNote(contextTargetNoteId, -1);
    }
    hideNotesContextMenu();
  });

  // "Move Down"
  ctxMoveDown.addEventListener('click', () => {
    if (contextTargetNoteId) {
      moveNote(contextTargetNoteId, 1);
    }
    hideNotesContextMenu();
  });

  // Hide ctx menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!notesCtxMenu.contains(e.target)) {
      hideNotesContextMenu();
    }
  });

  notesList.addEventListener('scroll', hideNotesContextMenu);

  // Undo / Redo buttons
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);

  // Ctrl+Z for undo, Ctrl+Y for redo
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.ctrlKey && e.key === 'z' && undoStack.length > 0) {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key === 'y' && redoStack.length > 0) {
      e.preventDefault();
      redo();
    }
  });

  // Standard buttons
  btnNotes.addEventListener('click', toggle);
  btnClearNotes.addEventListener('click', clearAll);

  return {
    toggle,
    open,
    close,
    addTextNote,
    addImageNote,
    removeNote,
    clearAll,
    undo,
    redo,
    getNotes,
    getNoteById,
    getCount,
    get isOpen() { return isOpen; }
  };
})();
