/**
 * exporter.js — Export Notes as DOCX, PDF, or TXT
 * Uses 'docx' for Word, 'jsPDF' for PDF, and plain text for TXT.
 * Each note is a bullet point with [Page X] tag.
 */
const Exporter = (() => {

  function buildNotesFilename(bookName) {
    const safeName = String(bookName || 'Untitled')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();
    return `Notes_${safeName || 'Untitled'}`;
  }

  // ─── DOCX Export ──────────────────────────────────────────
  async function exportNotesAsDocx(bookName, notes, includePages = true) {
    if (!notes || notes.length === 0) {
      showToast('No notes to export');
      return;
    }

    try {
      const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, BorderStyle } = docx;

      const children = [];

      // Title
      children.push(
        new Paragraph({
          text: `Notes: ${bookName}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        })
      );

      // Date
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
              italics: true,
              color: '888888',
              size: 20
            })
          ],
          spacing: { after: 400 }
        })
      );

      // Separator
      children.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
          },
          spacing: { after: 300 }
        })
      );

      // Notes as bullet points
      for (const note of notes) {
        if (note.type === 'text') {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${note.content}  `, size: 22 }),
                ...(includePages ? [new TextRun({ text: `[Page ${note.page}]`, bold: true, color: '4472C4', size: 20 })] : [])
              ],
              bullet: { level: 0 },
              spacing: { after: 120 }
            })
          );
        } else if (note.type === 'image') {
          try {
            const imageData = await dataUrlToArrayBuffer(note.content);
            const dimensions = await getImageDimensions(note.content);
            let width = dimensions.width;
            let height = dimensions.height;
            if (width > 500) {
              const scale = 500 / width;
              width = 500;
              height = Math.round(height * scale);
            }
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({ data: imageData, transformation: { width, height }, type: 'png' })
                ],
                spacing: { after: 60 }
              })
            );
            if (includePages) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `[Page ${note.page}]`, bold: true, color: '4472C4', size: 20, italics: true })
                  ],
                  spacing: { after: 200 }
                })
              );
            }
          } catch (imgErr) {
            console.warn('Could not embed image:', imgErr);
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `[Image - could not embed]  `, italics: true, size: 22 }),
                  ...(includePages ? [new TextRun({ text: `[Page ${note.page}]`, bold: true, color: '4472C4', size: 20 })] : [])
                ],
                bullet: { level: 0 },
                spacing: { after: 120 }
              })
            );
          }
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${buildNotesFilename(bookName)}.docx`);
      showToast('Notes saved as DOCX!');
      return true;
    } catch (e) {
      console.error('DOCX export failed:', e);
      showToast('Export failed: ' + e.message);
      return false;
    }
  }

  // ─── PDF Export ───────────────────────────────────────────
  async function exportNotesAsPdf(bookName, notes, includePages = true) {
    if (!notes || notes.length === 0) {
      showToast('No notes to export');
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 20;
      const marginRight = 20;
      const maxWidth = pageWidth - marginLeft - marginRight;
      let y = 25;

      // Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(40, 40, 60);
      pdf.text(`Notes: ${bookName}`, marginLeft, y);
      y += 10;

      // Date
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(130, 130, 130);
      pdf.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, marginLeft, y);
      y += 6;

      // Separator line
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, y, pageWidth - marginRight, y);
      y += 10;

      // Notes
      for (const note of notes) {
        if (note.type === 'text') {
          // Check if we need a new page
          const textLines = pdf.splitTextToSize(`• ${note.content}`, maxWidth - 5);
          const blockHeight = textLines.length * 5 + 4;

          if (y + blockHeight > pageHeight - 20) {
            pdf.addPage();
            y = 20;
          }

          // Bullet text
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
          pdf.setTextColor(50, 50, 50);
          pdf.text(textLines, marginLeft + 2, y);
          y += textLines.length * 5;

          // Page tag
          if (includePages) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(68, 114, 196);
            pdf.text(`[Page ${note.page}]`, marginLeft + 2, y);
            y += 7;
          } else {
            y += 3;
          }

        } else if (note.type === 'image') {
          try {
            const dims = await getImageDimensions(note.content);
            let imgW = Math.min(dims.width, maxWidth * 2.5); // mm conversion ~2.83px/mm
            let imgH = dims.height * (imgW / dims.width);

            // Scale to fit page width (convert px to mm roughly)
            const maxImgW = maxWidth;
            const scaledW = Math.min(imgW / 2.83, maxImgW);
            const scaledH = imgH / 2.83 * (scaledW / (imgW / 2.83));

            if (y + scaledH + 10 > pageHeight - 20) {
              pdf.addPage();
              y = 20;
            }

            pdf.addImage(note.content, 'PNG', marginLeft, y, scaledW, scaledH);
            y += scaledH + 3;

            // Page tag
            if (includePages) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);
              pdf.setTextColor(68, 114, 196);
              pdf.text(`[Page ${note.page}]`, marginLeft, y);
              y += 8;
            } else {
              y += 3;
            }
          } catch (imgErr) {
            console.warn('Could not embed image in PDF:', imgErr);
            if (y + 10 > pageHeight - 20) { pdf.addPage(); y = 20; }
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(10);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`[Image - could not embed]${includePages ? '  [Page ' + note.page + ']' : ''}`, marginLeft + 2, y);
            y += 7;
          }
        }
      }

      pdf.save(`${buildNotesFilename(bookName)}.pdf`);
      showToast('Notes saved as PDF!');
      return true;
    } catch (e) {
      console.error('PDF export failed:', e);
      showToast('PDF export failed: ' + e.message);
      return false;
    }
  }

  // ─── TXT Export ───────────────────────────────────────────
  function exportNotesAsTxt(bookName, notes, includePages = true) {
    if (!notes || notes.length === 0) {
      showToast('No notes to export');
      return;
    }

    try {
      const lines = [];

      lines.push(`Notes: ${bookName}`);
      lines.push(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
      lines.push('─'.repeat(50));
      lines.push('');

      for (const note of notes) {
        if (note.type === 'text') {
          lines.push(`  • ${note.content}${includePages ? '  [Page ' + note.page + ']' : ''}`);
          lines.push('');
        } else if (note.type === 'image') {
          lines.push(`  • [Image captured]${includePages ? '  [Page ' + note.page + ']' : ''}`);
          lines.push('');
        }
      }

      lines.push('─'.repeat(50));
      lines.push(`Total: ${notes.length} notes`);

      const text = lines.join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, `${buildNotesFilename(bookName)}.txt`);
      showToast('Notes saved as TXT!');
      return true;
    } catch (e) {
      console.error('TXT export failed:', e);
      showToast('TXT export failed: ' + e.message);
      return false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────
  function dataUrlToArrayBuffer(dataUrl) {
    return new Promise((resolve) => {
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const len = binary.length;
      const buffer = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        buffer[i] = binary.charCodeAt(i);
      }
      resolve(buffer);
    });
  }

  function getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve({ width: 200, height: 200 });
      img.src = dataUrl;
    });
  }

  return {
    exportNotesAsDocx,
    exportNotesAsPdf,
    exportNotesAsTxt
  };
})();
