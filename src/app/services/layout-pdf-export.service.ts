import { Injectable } from '@angular/core';
import type { ButtonAction, LayoutDocument, MenuLayout, TouchButton } from '../state/layout-model';
import { GRID_COLS, GRID_ROWS, padButtonsToGrid } from '../state/layout-model';

@Injectable({ providedIn: 'root' })
export class LayoutPdfExportService {
  async exportMenusToPdf(document: LayoutDocument): Promise<Blob> {
    const bytes = await this.exportMenusToPdfBytes(document);
    const arrayBuffer: ArrayBuffer = bytes.slice().buffer;
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  }

  async exportMenusToPdfBytes(document: LayoutDocument): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdf = await PDFDocument.create();

    // Standard Fonts in pdf-lib nutzen WinAnsi-Encoding (kein volles Unicode).
    // Wir versuchen zusätzlich, eine Unicode-TTF aus /public einzubetten.
    const fontFallbackRegular = await pdf.embedFont(StandardFonts.Helvetica);
    const fontFallbackBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const embedded = await this.tryEmbedUnicodeFonts(pdf);
    const fontRegular = embedded?.regular ?? fontFallbackRegular;
    const fontBold = embedded?.bold ?? fontFallbackBold;

    const layouts = [...document.layouts].sort((a, b) => a.menuLayoutNo - b.menuLayoutNo);

    const createPageContext = () => {
      const page = pdf.addPage();
      const marginX = 48;
      const marginTop = 56;
      const marginBottom = 48;
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const contentWidth = pageWidth - marginX * 2;
      let y = pageHeight - marginTop;

      return { page, marginX, marginTop, marginBottom, pageWidth, pageHeight, contentWidth, y };
    };

    if (layouts.length === 0) {
      const { page } = createPageContext();
      page.drawText(this.sanitizePdfText('Keine Menüs vorhanden.'), {
        x: 48,
        y: page.getHeight() - 72,
        size: 14,
        font: fontBold,
      });
    }

    for (const layout of layouts) {
      const ctx = createPageContext();

      // Header
      const header = `${layout.displayText || '(Ohne Namen)'} (Nr. ${layout.menuLayoutNo})`;
      ctx.y = this.drawWrappedText(ctx.page, header, {
        x: ctx.marginX,
        y: ctx.y,
        maxWidth: ctx.contentWidth,
        font: fontBold,
        fontSize: 16,
        lineHeight: 18,
      });

      ctx.y -= 8;

      // Einstellungen
      const settingsLines: readonly string[] = this.getLayoutSettingsLines(layout);
      for (const line of settingsLines) {
        ctx.y = this.drawWrappedText(ctx.page, line, {
          x: ctx.marginX,
          y: ctx.y,
          maxWidth: ctx.contentWidth,
          font: fontRegular,
          fontSize: 10.5,
          lineHeight: 13.5,
        });
      }

      ctx.y -= 10;
      ctx.page.drawLine({
        start: { x: ctx.marginX, y: ctx.y },
        end: { x: ctx.pageWidth - ctx.marginX, y: ctx.y },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.85),
      });
      ctx.y -= 14;

      // Grid
      const availableHeight = Math.max(0, ctx.y - ctx.marginBottom);
      const gridHeight = Math.max(240, availableHeight);

      this.drawMenuGrid(ctx.page, layout, {
        x: ctx.marginX,
        topY: ctx.y,
        width: ctx.contentWidth,
        height: gridHeight,
        fontRegular,
        fontBold,
        rgb,
      });
    }

    return pdf.save();
  }

  private async tryEmbedUnicodeFonts(
    pdf: import('pdf-lib').PDFDocument,
  ): Promise<{ readonly regular: import('pdf-lib').PDFFont; readonly bold: import('pdf-lib').PDFFont } | null> {
    // Optional: Wenn eine TTF im public-Ordner liegt, nutzen wir diese.
    // Achtung: Die Datei ist NICHT im Repo enthalten (Lizenz). Nutzer können sie selbst ablegen.
    // Wir versuchen mehrere bekannte Dateinamen.
    const candidates = [
      { regular: '/fonts/DejaVuSans.ttf', bold: '/fonts/DejaVuSans-Bold.ttf' },
      { regular: '/fonts/NotoSans-Regular.ttf', bold: '/fonts/NotoSans-Bold.ttf' },
    ] as const;

    for (const cand of candidates) {
      const regularBytes = await this.tryFetchBytes(cand.regular);
      if (!regularBytes) continue;

      const boldBytes = (await this.tryFetchBytes(cand.bold)) ?? regularBytes;

      try {
        const regular = await pdf.embedFont(regularBytes, { subset: true });
        const bold = await pdf.embedFont(boldBytes, { subset: true });
        return { regular, bold };
      } catch {
        // Wenn Einbettung fehlschlägt, probieren wir nächsten Kandidaten.
      }
    }

    return null;
  }

  private async tryFetchBytes(url: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  private getLayoutSettingsLines(layout: MenuLayout): readonly string[] {
    const lines: string[] = [];
    lines.push('Einstellungen:');
    lines.push(`• Name: ${layout.displayText?.trim() ? layout.displayText.trim() : '(ohne Name)'}`);
    lines.push(`• Menü-Nr: ${layout.menuLayoutNo}`);
    lines.push(`• DontClose: ${layout.dontClose ? 'Ja' : 'Nein'}`);

    const comment = (layout.comment ?? '').trim();
    if (comment.length > 0) {
      lines.push(`• Kommentar: ${comment}`);
    }

    return lines;
  }

  private formatAction(action: ButtonAction, button: TouchButton): string {
    // Wichtig: keine Unicode-Pfeile hier verwenden, sonst crasht pdf-lib Standardfont (WinAnsi).
    switch (action) {
      case 'nav':
        return `Navigation -> Menü ${button.gotoLayoutNo ?? '-'}`;
      case 'pos':
        return `POS -> KeyCode ${button.posKeyCode ?? '-'} / Function ${button.posKeyFunction ?? '-'}`;
      case 'empty':
        return 'Leer';
    }

    return 'Unbekannt';
  }

  private sanitizePdfText(input: string): string {
    // Fallback für Standard-Fonts (WinAnsi). Wenn wir eine Unicode-TTF eingebettet haben,
    // ist das Sanitizing meist nicht nötig, aber es schadet nicht (macht Export robuster).

    const normalized = input.normalize('NFKC');

    return (
      normalized
        // Pfeile
        .replaceAll('→', '->')
        .replaceAll('←', '<-')
        // Ellipsis
        .replaceAll('…', '...')
        // typografische Anführungszeichen
        .replaceAll('“', '"')
        .replaceAll('”', '"')
        .replaceAll('„', '"')
        .replaceAll('’', "'")
        .replaceAll('‘', "'")
        // Bullets
        .replaceAll('•', '*')
        // NBSP etc.
        .replace(/\u00A0/g, ' ')
    );
  }

  private drawWrappedText(
    page: import('pdf-lib').PDFPage,
    text: string,
    opts: {
      x: number;
      y: number;
      maxWidth: number;
      font: import('pdf-lib').PDFFont;
      fontSize: number;
      lineHeight: number;
      maxLines?: number;
      color?: import('pdf-lib').RGB;
    },
  ): number {
    const safeText = this.sanitizePdfText(text);
    const words = safeText.split(/\s+/g).filter((w) => w.length > 0);
    if (words.length === 0) return opts.y - opts.lineHeight;

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const width = opts.font.widthOfTextAtSize(next, opts.fontSize);
      if (width <= opts.maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }

      if (opts.maxLines != null && lines.length >= opts.maxLines) break;
    }

    if (opts.maxLines == null || lines.length < opts.maxLines) {
      if (current) lines.push(current);
    }

    let y = opts.y;
    for (let i = 0; i < lines.length; i += 1) {
      const isLast = i === lines.length - 1;
      const maxLines = opts.maxLines;
      let line = lines[i]!;

      if (maxLines != null && isLast && lines.length === maxLines) {
        // ASCII-Ellipsis, damit WinAnsi sicher ist.
        const ellipsis = '';
        if (opts.font.widthOfTextAtSize(`${line}${ellipsis}`, opts.fontSize) <= opts.maxWidth) {
          line = `${line}${ellipsis}`;
        }
      }

      page.drawText(this.sanitizePdfText(line), {
        x: opts.x,
        y,
        size: opts.fontSize,
        font: opts.font,
        ...(opts.color ? { color: opts.color } : {}),
      });
      y -= opts.lineHeight;
    }

    return y;
  }

  private drawMenuGrid(
    page: import('pdf-lib').PDFPage,
    layout: MenuLayout,
    opts: {
      x: number;
      topY: number;
      width: number;
      height: number;
      fontRegular: import('pdf-lib').PDFFont;
      fontBold: import('pdf-lib').PDFFont;
      rgb: typeof import('pdf-lib').rgb;
    },
  ): void {
    const padding = 6;
    const minCellHeight = 60;

    // Grid: 6 Zeilen x 3 Spalten.
    const cols = GRID_COLS;
    const rows = GRID_ROWS;

    const cellW = opts.width / cols;

    // Stelle sicher, dass das Grid in den verfügbaren Bereich passt.
    // Wenn der Bereich klein ist, reduzieren wir die Zellhöhe (bis minCellHeight),
    // ansonsten wird der freie Platz genutzt.
    const cellH = Math.max(minCellHeight, Math.min(120, opts.height / rows));

    // Linienfarbe
    const strokeDefault = opts.rgb(0.8, 0.8, 0.8);

    const buttons = padButtonsToGrid(layout.touchButtons);

    const colorFor = (btn: TouchButton) => {
      switch (btn.fontColor) {
        case 'ORANGE':
          return opts.rgb(0.9, 0.45, 0.0);
        case 'BLUE':
          return opts.rgb(0.1, 0.35, 0.85);
        case 'PURPLE':
          return opts.rgb(0.45, 0.2, 0.7);
        case 'BLACK':
        default:
          return opts.rgb(0, 0, 0);
      }
    };

    for (let i = 0; i < buttons.length; i += 1) {
      const btn = buttons[i]!;
      const row = Math.floor(i / cols);
      const col = i % cols;

      const x = opts.x + col * cellW;
      const yTop = opts.topY - row * cellH;
      const y = yTop - cellH;

      const accent = colorFor(btn);
      const hasColor = btn.fontColor != null;

      // Rahmen: Standard + farbiger Akzent (links), damit Farbe sichtbar ist,
      // aber nicht ausschließlich über Farbe kommuniziert wird.
      page.drawRectangle({
        x,
        y,
        width: cellW,
        height: cellH,
        borderColor: strokeDefault,
        borderWidth:  1,
      });


      // Inhalt
      const textX = x + padding;
      const textMaxWidth = cellW - padding * 2;

      // Start oben in der Zelle
      let textY = yTop - padding - 11;

      const title = btn.displayText?.trim() ? btn.displayText.trim() : '';
      const slotLabel = `${i + 1}`;

      const headerLine = title.length ? `${slotLabel}. ${title}` : '';

      // Titel: max 2 Zeilen (farbig, falls fontColor vorhanden)
      textY = this.drawWrappedText(page, headerLine, {
        x: textX,
        y: textY,
        maxWidth: textMaxWidth,
        font: opts.fontBold,
        fontSize: 10,
        lineHeight: 11.5,
        maxLines: 2,
        color: hasColor ? accent : undefined,
      });

      // Optional: Farbe als Textlabel, damit es auch ohne Farbwahrnehmung erkennbar ist.
      if (hasColor && btn.fontColor) {
        textY -= 0.5;
        textY = this.drawWrappedText(page, `Farbe: ${btn.fontColor}`, {
          x: textX,
          y: textY,
          maxWidth: textMaxWidth,
          font: opts.fontRegular,
          fontSize: 7.5,
          lineHeight: 9,
          maxLines: 1,
        });
      }

      // Detail: Aktion (max 2 Zeilen)
      if (btn.action !== 'empty') {
        const actionLine = this.formatAction(btn.action, btn);
        textY -= 1;
        textY = this.drawWrappedText(page, actionLine, {
          x: textX,
          y: textY,
          maxWidth: textMaxWidth,
          font: opts.fontRegular,
          fontSize: 8.5,
          lineHeight: 10,
          maxLines: 2,
        });
      }

      // Kommentar (max 2 Zeilen, damit nichts „unten rausläuft“)
      const comment = (btn.comment ?? '').trim();
      if (comment.length > 0) {
        textY -= 1;
        this.drawWrappedText(page, comment, {
          x: textX,
          y: textY,
          maxWidth: textMaxWidth,
          font: opts.fontRegular,
          fontSize: 8,
          lineHeight: 9.5,
          maxLines: 2,
        });
      }
    }
  }
}
