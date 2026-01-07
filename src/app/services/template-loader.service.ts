import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TemplateLoaderService {
  async loadTemplateXml(templateKey: string): Promise<string> {
    const raw = templateKey.trim();
    if (!raw.length) {
      throw new Error('Template-Name ist leer.');
    }

    // Minimaler Schutz: nur Buchstaben/Zahlen/_- erlauben (kein Pfad-Traversal).
    const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe.length) {
      throw new Error('Ungültiger Template-Name.');
    }

    // Case-insensitive loading:
    // - Auf Windows/macOS ist der Dateiname oft case-insensitive.
    // - Auf Linux (z.B. CI/Hosting) nicht.
    // Daher probieren wir in sinnvoller Reihenfolge mehrere Varianten.
    const baseCandidates = Array.from(
      new Set([
        safe,
        safe.toLowerCase(),
        safe.toUpperCase(),
      ]),
    );

    const candidates = baseCandidates.flatMap((name) => {
      // Falls User schon .xml eingegeben hat, nicht doppelt anhängen.
      return name.toLowerCase().endsWith('.xml') ? [name] : [name, `${name}.xml`];
    });

    for (const candidate of candidates) {
      const url = `/template/${candidate}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
        },
      });

      if (res.ok) {
        const text = await res.text();

        // Angular dev-server liefert bei nicht gefundenen Assets oft index.html (Status 200),
        // was dann beim XML-Parse als "StartTag: invalid element name" auffällt.
        const contentType = res.headers.get('content-type') ?? '';
        const prefix = text.replace(/^\uFEFF/, '').trimStart().slice(0, 50).toLowerCase();

        const looksLikeHtml = prefix.startsWith('<!doctype html') || prefix.startsWith('<html');
        const looksLikeXml = prefix.startsWith('<drawer') || prefix.startsWith('<root') || prefix.startsWith('<?xml');
        const isXmlContentType = contentType.includes('xml');

        if (looksLikeHtml && !looksLikeXml) {
          // wie 404 behandeln -> nächste Variante probieren
          continue;
        }

        if (!isXmlContentType && !looksLikeXml) {
          // Nicht eindeutig XML → nächste Variante probieren
          continue;
        }

        return text;
      }

      // Nur bei 404 weiter probieren, sonst sofort fail.
      if (res.status !== 404) {
        throw new Error(`Template konnte nicht geladen werden (HTTP ${res.status}).`);
      }
    }

    throw new Error(`Template konnte nicht gefunden werden: ${raw}`);
  }
}
