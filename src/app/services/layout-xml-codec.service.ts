import { Injectable } from '@angular/core';
import { ButtonColor, LayoutDocument, MenuLayout, PosKeyCode, TouchButton } from '../state/layout-model';

type ParseOk = { readonly ok: true; readonly document: LayoutDocument };
type ParseErr = { readonly ok: false; readonly error: string };
export type ParseResult = ParseOk | ParseErr;

@Injectable({ providedIn: 'root' })
export class LayoutXmlCodecService {
  parse(xmlText: string): ParseResult {
    // Manche Dateien enthalten ein BOM oder unsichtbare Prefix-Bytes.
    const normalizedText = xmlText.replace(/^\uFEFF/, '').trimStart();

    const parser = new DOMParser();
    const xml = parser.parseFromString(normalizedText, 'application/xml');

    const parserError = xml.getElementsByTagName('parsererror')[0];
    if (parserError) {
      const msg = parserError.textContent?.trim() || 'Ungültiges XML.';
      return { ok: false, error: msg };
    }

    // Akzeptiere sowohl neues Format (<Drawer>) als auch ältere Dateien (<root>).
    const rootName = xml.documentElement?.tagName ?? '';
    if (rootName && rootName !== 'Drawer' && rootName !== 'root') {
      // Nicht-fatal: wir können trotzdem nach MenuLayout suchen, aber geben einen nützlichen Hinweis.
      // (Manche Browser geben sonst nur die generische Parser-Meldung aus.)
    }

    const layoutNodes = Array.from(xml.getElementsByTagName('MenuLayout'));
    const layouts = layoutNodes.map((node) => this.parseMenuLayout(node));

    return { ok: true, document: { layouts } };
  }

  serialize(doc: LayoutDocument): string {
    const xml = document.implementation.createDocument('', 'Drawer', null);
    const root = xml.documentElement;

    for (const layout of doc.layouts) {
      root.appendChild(this.serializeMenuLayout(xml, layout));
    }

    return this.prettyPrintDocument(xml);
  }

  private prettyPrintDocument(xml: XMLDocument): string {
    // In modernen Browsern (inkl. Chromium) ist XSLTProcessor verfügbar.
    // Damit bekommen wir zuverlässige Einrückung ohne fragile Regex-Regeln.
    try {
      const xslt = document.implementation.createDocument('', '', null);
      const stylesheet = xslt.createElement('xsl:stylesheet');
      stylesheet.setAttribute('version', '1.0');
      stylesheet.setAttribute('xmlns:xsl', 'http://www.w3.org/1999/XSL/Transform');

      const output = xslt.createElement('xsl:output');
      output.setAttribute('method', 'xml');
      output.setAttribute('indent', 'yes');
      stylesheet.appendChild(output);

      // Identitäts-Transform: kopiert alle Nodes.
      const template = xslt.createElement('xsl:template');
      template.setAttribute('match', '@*|node()');

      const copy = xslt.createElement('xsl:copy');
      const apply = xslt.createElement('xsl:apply-templates');
      apply.setAttribute('select', '@*|node()');
      copy.appendChild(apply);
      template.appendChild(copy);
      stylesheet.appendChild(template);

      xslt.appendChild(stylesheet);

      const processor = new XSLTProcessor();
      processor.importStylesheet(xslt);

      const transformed = processor.transformToDocument(xml);
      const raw = new XMLSerializer().serializeToString(transformed);

      // Manche Engines liefern keinen finalen Zeilenumbruch.
      return raw.endsWith('\n') ? raw : `${raw}\n`;
    } catch {
      const raw = new XMLSerializer().serializeToString(xml);
      return this.prettyPrintXml(raw);
    }
  }

  private prettyPrintXml(xmlString: string): string {
    const withLineBreaks = xmlString.replace(/>(\s*)</g, '>\n<');

    const lines = withLineBreaks
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let indentLevel = 0;
    const indentSize = 2;

    const result: string[] = [];

    for (const line of lines) {
      const isDeclarationOrDoctype = /^<\?xml\b/.test(line) || /^<!DOCTYPE\b/i.test(line);
      const isCommentOrCData = /^<!--/.test(line) || /^<!\[CDATA\[/.test(line);

      const isClosingTag = /^<\//.test(line);
      const isSelfClosingTag = /\/>$/.test(line) || isDeclarationOrDoctype || isCommentOrCData;
      const isOpeningTag = /^</.test(line) && !isClosingTag && !isSelfClosingTag;

      if (isClosingTag) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      result.push(`${' '.repeat(indentLevel * indentSize)}${line}`);

      if (isOpeningTag) {
        indentLevel += 1;
      }
    }

    return result.join('\n') + '\n';
  }

  private parseMenuLayout(node: Element): MenuLayout {
    const menuLayoutNo = this.readNumber(node, 'MenuLayoutNo') ?? 0;
    const displayText = this.readText(node, 'DisplayText') ?? '';
    const dontClose = this.readBool(node, 'DontClose') ?? false;

    const touchButtonNodes = Array.from(node.getElementsByTagName('TouchButton'));
    const touchButtons = touchButtonNodes.map((btn) => this.parseTouchButton(btn));

    return {
      menuLayoutNo,
      displayText,
      dontClose,
      touchButtons,
    };
  }

  private parseTouchButton(node: Element): TouchButton {
    const displayText = this.readText(node, 'DisplayText') ?? '';
    const fontColor = this.readText(node, 'FontColor') as ButtonColor | null;

    const gotoLayoutNo = this.readNumber(node, 'GotoLayoutNo');

    const posKey = node.getElementsByTagName('POSKey')[0] ?? null;
    const posKeyCode = posKey ? (this.readText(posKey, 'KeyCode') as PosKeyCode | null) : null;
    const posKeyFunction = posKey ? this.readNumber(posKey, 'KeyFunction') : null;

    const action: TouchButton['action'] = gotoLayoutNo != null ? 'nav' : posKey ? 'pos' : 'empty';

    return {
      displayText,
      fontColor: this.normalizeColor(fontColor),
      action,
      gotoLayoutNo: action === 'nav' ? gotoLayoutNo : null,
      posKeyCode: action === 'pos' ? posKeyCode : null,
      posKeyFunction: action === 'pos' ? posKeyFunction : null,
    };
  }

  private normalizeColor(color: ButtonColor | null): ButtonColor | null {
    if (!color) return null;
    const allowed: readonly ButtonColor[] = ['BLACK', 'ORANGE', 'BLUE', 'PURPLE'];
    return allowed.includes(color) ? color : null;
  }

  private readText(parent: Element, tagName: string): string | null {
    const el = parent.getElementsByTagName(tagName)[0];
    if (!el) return null;
    const value = el.textContent?.trim() ?? '';
    return value.length ? value : '';
  }

  private readNumber(parent: Element, tagName: string): number | null {
    const text = this.readText(parent, tagName);
    if (text == null) return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  }

  private readBool(parent: Element, tagName: string): boolean | null {
    const text = this.readText(parent, tagName);
    if (text == null) return null;
    return text === 'true' || text === '1';
  }

  private serializeMenuLayout(xml: XMLDocument, layout: MenuLayout): Element {
    const el = xml.createElement('MenuLayout');

    el.appendChild(this.elText(xml, 'MenuLayoutNo', String(layout.menuLayoutNo)));
    el.appendChild(this.elText(xml, 'DisplayText', layout.displayText));
    el.appendChild(this.elText(xml, 'DontClose', layout.dontClose ? 'true' : 'false'));

    for (const btn of layout.touchButtons) {
      el.appendChild(this.serializeTouchButton(xml, btn));
    }

    return el;
  }

  private serializeTouchButton(xml: XMLDocument, btn: TouchButton): Element {
    const el = xml.createElement('TouchButton');

    el.appendChild(this.elText(xml, 'DisplayText', btn.displayText));
    if (btn.fontColor) {
      el.appendChild(this.elText(xml, 'FontColor', btn.fontColor));
    }

    if (btn.action === 'nav') {
      el.appendChild(this.elText(xml, 'GotoLayoutNo', String(btn.gotoLayoutNo)));
    }

    if (btn.action === 'pos') {
      const posKey = xml.createElement('POSKey');
      if (btn.posKeyCode) {
        posKey.appendChild(this.elText(xml, 'KeyCode', btn.posKeyCode));
      }
      if (btn.posKeyFunction != null) {
        posKey.appendChild(this.elText(xml, 'KeyFunction', String(btn.posKeyFunction)));
      }
      el.appendChild(posKey);
    }

    return el;
  }

  private elText(xml: XMLDocument, tagName: string, value: string): Element {
    const el = xml.createElement(tagName);
    el.textContent = value;
    return el;
  }


  createNewDocument(): LayoutDocument {
    const layout: MenuLayout = {
      menuLayoutNo: 0,
      displayText: 'Hauptmenü',
      dontClose: false,
      touchButtons: [],
    };
    return { layouts: [layout] };
  }

  createNewLayout(layoutNo: number): MenuLayout {
    return {
      menuLayoutNo: layoutNo,
      displayText: `Layout ${layoutNo}`,
      dontClose: false,
      touchButtons: [],
    };
  }
}
