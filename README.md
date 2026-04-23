# Any eBook Reader & Annotator — Firefox Extension

> Read DOCX, PDF, EPUB, MOBI, and AZW3 eBooks with highlighting and note-taking — right inside your browser.

---

## Features

- 📖 **Multi-Format Support** — Open and read EPUB, MOBI, AZW3, PDF, and DOCX files directly in Firefox
- ✏️ **Text Highlighting** — Select text to create color-coded highlights
- 📝 **Notes & Annotations** — Attach notes to any highlighted passage
- 📷 **Region Screenshots** — Draw a region to capture a visual snippet as a note
- 🖼️ **Image Capture** — Click-to-capture images directly from your eBook
- ↩️ **Undo / Redo** — Full undo/redo support for all note operations
- ↕️ **Drag to Reorder** — Drag the grip handle on any card to reorder notes
- 💾 **Export** — Save your notes as a formatted **PDF**, **DOCX**, or **TXT** file
- 🌗 **Offline & Local** — All processing happens locally — no data leaves your device

---

## Installation

### From Firefox Add-ons (AMO)
Search **"Any eBook Reader & Annotator"** on [addons.mozilla.org](https://addons.mozilla.org)

### Developer Install
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from this folder

---

## How to Use

1. Click the **Any eBook Reader** icon in the toolbar
2. Drop a file (EPUB, PDF, DOCX, MOBI, or AZW3) into the reader
3. **Highlight text** to create annotations
4. Use the **camera icon** to capture screenshot notes
5. **Right-click** a note for move, delete, or style options
6. Use **Save as → PDF / DOCX / TXT** to export your notes

---

## Project Structure

```
├── manifest.json          # MV2 manifest
├── background.js          # Background script — tab management
├── popup/
│   ├── popup.html         # Toolbar popup UI
│   └── popup.js           # Opens the reader tab on click
├── reader/
│   ├── reader.html        # Main reader page layout
│   ├── reader.css         # Reader styles
│   ├── reader.js          # App controller — file routing, viewer init
│   ├── highlighter.js     # Text selection, highlight creation
│   ├── sidebar.js         # Notes state manager — undo/redo, add/delete/clear
│   ├── exporter.js        # Export notes to DOCX / PDF / TXT
│   ├── snapshot.js        # Region screenshot
│   └── image-capture.js   # Click-to-capture image notes
├── icons/                 # Extension icons (96, 256px)
└── lib/                   # Bundled third-party libraries
```

---

## Third-Party Libraries

| Library | License | Purpose |
|---------|---------|---------|
| [PDF.js](https://github.com/mozilla/pdf.js) | Apache 2.0 | PDF rendering |
| [Foliate-js](https://github.com/johnfactotum/foliate-js) | LGPL-3.0 | EPUB/MOBI/AZW3 rendering |
| [Mammoth.js](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | DOCX text extraction |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT | PDF export |
| [docx.js](https://github.com/dolanmiu/docx) | MIT | DOCX export |
| [FileSaver.js](https://github.com/eligrey/FileSaver.js) | MIT | File download helper |

---

## Privacy

**No data leaves your device.** All file processing and storage is local. No user data is collected, stored remotely, or transmitted.

---

## Developer

**YuvaTech**

---

## License

All Rights Reserved — free to use, modify, and distribute.
