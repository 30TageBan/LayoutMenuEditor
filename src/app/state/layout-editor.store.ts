import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LayoutXmlCodecService } from '../services/layout-xml-codec.service';
import { TemplateLoaderService } from '../services/template-loader.service';
import {
  GRID_SIZE,
  LayoutDocument,
  MenuLayout,
  TouchButton,
  createEmptyButton,
  padButtonsToGrid,
} from './layout-model';

@Injectable({ providedIn: 'root' })
export class LayoutEditorStore {
  private readonly codec = inject(LayoutXmlCodecService);
  private readonly templates = inject(TemplateLoaderService);

  readonly document = signal<LayoutDocument | null>(null);
  readonly error = signal<string | null>(null);
  readonly dirty = signal(false);

  readonly selectedLayoutIndex = signal(0);
  readonly selectedButtonIndex = signal<number | null>(null);

  readonly layouts = computed(() => this.document()?.layouts ?? []);

  readonly selectedLayout = computed<MenuLayout | null>(() => {
    const layouts = this.layouts();
    const idx = this.selectedLayoutIndex();
    return layouts[idx] ?? null;
  });

  readonly gridButtons = computed<readonly TouchButton[]>(() => {
    const layout = this.selectedLayout();
    if (!layout) return padButtonsToGrid([]);
    return padButtonsToGrid(layout.touchButtons);
  });

  readonly selectedButton = computed<TouchButton | null>(() => {
    const idx = this.selectedButtonIndex();
    if (idx == null) return null;
    return this.gridButtons()[idx] ?? null;
  });

  private readonly buttonClipboard = signal<TouchButton | null>(null);
  readonly canPasteButton = computed(() => this.buttonClipboard() != null);

  async loadTemplate(templateKey: string): Promise<void> {
    this.error.set(null);
    try {
      const xmlText = await this.templates.loadTemplateXml(templateKey);
      this.loadFromXmlText(xmlText);
      this.dirty.set(false);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Template konnte nicht geladen werden.');
    }
  }

  loadFromXmlText(xmlText: string): void {
    const result = this.codec.parse(xmlText);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }

    const ensured = this.ensureLayoutZero(result.document);

    // Reset History bei neuem Dokument.
    this.undoStack.set([]);
    this.redoStack.set([]);

    this.document.set(ensured);
    this.error.set(null);
    this.selectedLayoutIndex.set(0);
    this.selectedButtonIndex.set(null);
    this.dirty.set(false);
  }

  newDocument(): void {
    // Reset History bei neuem Dokument.
    this.undoStack.set([]);
    this.redoStack.set([]);

    this.document.set(this.ensureLayoutZero(this.codec.createNewDocument()));
    this.error.set(null);
    this.selectedLayoutIndex.set(0);
    this.selectedButtonIndex.set(null);
    this.dirty.set(false);
  }

  private readonly maxHistory = 30;
  private readonly undoStack = signal<readonly LayoutDocument[]>([]);
  private readonly redoStack = signal<readonly LayoutDocument[]>([]);

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  private pushHistory(before: LayoutDocument): void {
    const nextUndo = [...this.undoStack(), before].slice(-this.maxHistory);
    this.undoStack.set(nextUndo);
    this.redoStack.set([]);
  }

  private clampSelection(doc: LayoutDocument): void {
    const layoutsLen = doc.layouts.length;
    const nextLayoutIndex = Math.min(this.selectedLayoutIndex(), Math.max(0, layoutsLen - 1));
    this.selectedLayoutIndex.set(nextLayoutIndex);

    const btnIndex = this.selectedButtonIndex();
    if (btnIndex == null) return;

    const layout = doc.layouts[nextLayoutIndex];
    const buttonsLen = layout?.touchButtons.length ?? 0;
    if (btnIndex < 0 || btnIndex >= buttonsLen) {
      this.selectedButtonIndex.set(null);
    }
  }

  undo(): void {
    const doc = this.document();
    const undo = this.undoStack();
    if (!doc || undo.length === 0) return;

    const previous = undo[undo.length - 1]!;
    this.undoStack.set(undo.slice(0, -1));
    this.redoStack.set([...this.redoStack(), doc].slice(-this.maxHistory));

    this.document.set(previous);
    this.dirty.set(true);
    this.error.set(null);
    this.clampSelection(previous);
  }

  redo(): void {
    const doc = this.document();
    const redo = this.redoStack();
    if (!doc || redo.length === 0) return;

    const next = redo[redo.length - 1]!;
    this.redoStack.set(redo.slice(0, -1));
    this.undoStack.set([...this.undoStack(), doc].slice(-this.maxHistory));

    this.document.set(next);
    this.dirty.set(true);
    this.error.set(null);
    this.clampSelection(next);
  }

  selectButton(index: number): void {
    if (index < 0 || index >= GRID_SIZE) return;
    this.selectedButtonIndex.set(index);
  }

  createButtonAt(index: number): void {
    const doc = this.document();
    const layout = this.selectedLayout();
    if (!doc || !layout) return;
    if (index < 0 || index >= GRID_SIZE) return;

    const layouts = doc.layouts.slice();
    const layoutIndex = this.selectedLayoutIndex();
    const currentLayout = layouts[layoutIndex];
    if (!currentLayout) return;

    // Wenn der Button schon existiert, nur selektieren.
    if (index < currentLayout.touchButtons.length) {
      this.selectedButtonIndex.set(index);
      return;
    }

    this.pushHistory(doc);

    // Bis zum gewünschten Index auffüllen (mit leeren Buttons), aber nur bis GRID_SIZE.
    const nextButtons = currentLayout.touchButtons.slice();
    for (let i = nextButtons.length; i <= Math.min(index, GRID_SIZE - 1); i += 1) {
      nextButtons.push(createEmptyButton());
    }

    layouts[layoutIndex] = {
      ...currentLayout,
      touchButtons: nextButtons,
    };

    this.document.set({ ...doc, layouts });
    this.selectedButtonIndex.set(index);
    this.dirty.set(true);
  }

  updateSelectedButton(patch: Partial<TouchButton>): void {
    const doc = this.document();
    const layout = this.selectedLayout();
    const btnIndex = this.selectedButtonIndex();
    if (!doc || !layout || btnIndex == null) return;

    const layouts = doc.layouts.slice();
    const layoutIndex = this.selectedLayoutIndex();
    const currentLayout = layouts[layoutIndex];
    if (!currentLayout) return;

    // Wichtig: nicht mehr pauschal auf GRID_SIZE auffüllen, sonst würden wir 18 persistieren.
    // Für Updates erlauben wir maximal GRID_SIZE (UI-Slots).
    const existingButtons = currentLayout.touchButtons.slice(0, GRID_SIZE);

    // Falls es den Index noch nicht gibt, vorher erzeugen.
    if (btnIndex >= existingButtons.length) {
      for (let i = existingButtons.length; i <= btnIndex; i += 1) {
        existingButtons.push(createEmptyButton());
      }
    }

    const current = existingButtons[btnIndex] ?? createEmptyButton();
    const nextButton: TouchButton = { ...current, ...patch };

    // Wenn sich nichts ändert, keinen History-Eintrag erzeugen.
    const isSame = JSON.stringify(current) === JSON.stringify(nextButton);
    if (isSame) return;

    this.pushHistory(doc);

    existingButtons[btnIndex] = nextButton;

    layouts[layoutIndex] = {
      ...currentLayout,
      touchButtons: existingButtons,
    };

    this.document.set({ ...doc, layouts });
    this.dirty.set(true);
  }

  updateSelectedLayout(patch: Partial<Pick<MenuLayout, 'displayText' | 'menuLayoutNo' | 'dontClose'>>): void {
    const doc = this.document();
    if (!doc) return;

    // Nur pushen, wenn wirklich eine Änderung passiert.
    this.pushHistory(doc);

    const layouts = doc.layouts.slice();
    const idx = this.selectedLayoutIndex();
    const current = layouts[idx];
    if (!current) return;

    // Layout 0 darf seine Nummer nicht ändern.
    if (current.menuLayoutNo === 0 && patch.menuLayoutNo != null && patch.menuLayoutNo !== 0) {
      this.error.set('Layout-Nr 0 (Hauptmenü) darf nicht geändert werden.');
      return;
    }

    // Kein anderes Layout darf auf 0 gesetzt werden.
    if (current.menuLayoutNo !== 0 && patch.menuLayoutNo === 0) {
      this.error.set('Layout-Nr 0 ist reserviert (Hauptmenü) und darf nicht vergeben werden.');
      return;
    }

    // Eindeutigkeit von menuLayoutNo erzwingen.
    if (patch.menuLayoutNo != null && patch.menuLayoutNo !== current.menuLayoutNo) {
      const nextNo = patch.menuLayoutNo;
      if (!this.isLayoutNoUnique(layouts, nextNo, idx)) {
        this.error.set(`Layout-Nr ${nextNo} existiert bereits. Jede Layout-Nr darf nur einmal vorkommen.`);
        return;
      }
    }

    layouts[idx] = {
      ...current,
      ...patch,
    };

    this.document.set({ ...doc, layouts });
    this.dirty.set(true);
    this.error.set(null);
  }

  createLayout(): void {
    const doc = this.document();
    if (!doc) return;

    this.pushHistory(doc);

    const nextNo = this.nextFreeLayoutNo(doc);
    const next: MenuLayout = this.codec.createNewLayout(nextNo);

    this.document.set({ ...doc, layouts: [...doc.layouts, next] });
    this.selectedLayoutIndex.set(doc.layouts.length);
    this.selectedButtonIndex.set(null);
    this.dirty.set(true);
  }

  deleteSelectedLayout(): void {
    const doc = this.document();
    if (!doc) return;

    this.pushHistory(doc);

    const idx = this.selectedLayoutIndex();
    const current = doc.layouts[idx];
    if (!current) return;

    if (current.menuLayoutNo === 0) {
      this.error.set('Layout-Nr 0 (Hauptmenü) kann nicht gelöscht werden.');
      return;
    }

    if (doc.layouts.length <= 1) return;
    if (idx < 0 || idx >= doc.layouts.length) return;

    const nextLayouts = doc.layouts.filter((_, i) => i !== idx);

    const nextIndex = Math.min(idx, nextLayouts.length - 1);

    this.document.set({ ...doc, layouts: this.ensureLayoutZero({ layouts: nextLayouts }).layouts });
    this.selectedLayoutIndex.set(nextIndex);
    this.selectedButtonIndex.set(null);
    this.dirty.set(true);
  }

  deleteSelectedButton(): void {
    const idx = this.selectedButtonIndex();
    if (idx == null) return;
    this.deleteButtonAt(idx);
  }

  deleteButtonAt(index: number): void {
    const doc = this.document();
    const layout = this.selectedLayout();
    if (!doc || !layout) return;
    if (index < 0 || index >= GRID_SIZE) return;

    const layouts = doc.layouts.slice();
    const layoutIndex = this.selectedLayoutIndex();
    const currentLayout = layouts[layoutIndex];
    if (!currentLayout) return;

    const existing = currentLayout.touchButtons.slice(0, GRID_SIZE);
    if (index >= existing.length) {
      // Auf einem '+ Erstellen'-Slot gibt es nichts zu löschen.
      this.selectedButtonIndex.set(null);
      return;
    }

    this.pushHistory(doc);

    const next = existing.slice(0, index).concat(existing.slice(index + 1));
    const trimmed = this.trimTrailingEmptyButtons(next);

    layouts[layoutIndex] = {
      ...currentLayout,
      touchButtons: trimmed,
    };

    this.document.set({ ...doc, layouts });
    this.dirty.set(true);
    this.selectedButtonIndex.set(null);
  }

  reorderButtons(fromIndex: number, toIndex: number): void {
    const doc = this.document();
    const layout = this.selectedLayout();
    if (!doc || !layout) return;

    const len = layout.touchButtons.length;
    if (fromIndex < 0 || fromIndex >= len) return;
    if (toIndex < 0 || toIndex >= len) return;
    if (fromIndex === toIndex) return;

    this.pushHistory(doc);

    const layouts = doc.layouts.slice();
    const layoutIndex = this.selectedLayoutIndex();
    const currentLayout = layouts[layoutIndex];
    if (!currentLayout) return;

    const nextButtons = currentLayout.touchButtons.slice();
    const [moved] = nextButtons.splice(fromIndex, 1);
    if (!moved) return;
    nextButtons.splice(toIndex, 0, moved);

    layouts[layoutIndex] = {
      ...currentLayout,
      touchButtons: nextButtons,
    };

    this.document.set({ ...doc, layouts });
    this.dirty.set(true);

    const selected = this.selectedButtonIndex();
    if (selected == null) return;

    // Selection "wandert" logisch mit.
    if (selected === fromIndex) {
      this.selectedButtonIndex.set(toIndex);
      return;
    }

    // Wenn ein Element vor dem selektierten rausgezogen/eingefügt wird, verschiebt sich der Index.
    if (fromIndex < selected && toIndex >= selected) {
      this.selectedButtonIndex.set(selected - 1);
      return;
    }

    if (fromIndex > selected && toIndex <= selected) {
      this.selectedButtonIndex.set(selected + 1);
    }
  }

  private ensureLayoutZero(doc: LayoutDocument): LayoutDocument {
    if (doc.layouts.some((l) => l.menuLayoutNo === 0)) return doc;

    const zero: MenuLayout = {
      menuLayoutNo: 0,
      displayText: 'Hauptmenü',
      dontClose: false,
      touchButtons: [],
    };

    return { layouts: [zero, ...doc.layouts] };
  }

  private isLayoutNoUnique(layouts: readonly MenuLayout[], menuLayoutNo: number, exceptIndex: number): boolean {
    return !layouts.some((l, i) => i !== exceptIndex && l.menuLayoutNo === menuLayoutNo);
  }

  exportXml(): string | null {
    const doc = this.document();
    if (!doc) return null;
    return this.codec.serialize(doc);
  }

  // Optional: auto-load when query param exists (wire in component shell)
  wireQueryParamTemplate(route: ActivatedRoute): void {
    effect(() => {
      const template = route.snapshot.queryParamMap.get('template');
      // Snapshot reicht hier, weil Angular Effect nicht auf route changes reagiert.
      // Wir werten das in der Shell zusätzlich via queryParamMap-Observable aus.
      if (template) {
        void this.loadTemplate(template);
      }
    });
  }

  selectLayout(index: number): void {
    const layouts = this.layouts();
    if (index < 0 || index >= layouts.length) return;

    this.selectedLayoutIndex.set(index);
    this.selectedButtonIndex.set(null);
  }

  private trimTrailingEmptyButtons(buttons: readonly TouchButton[]): readonly TouchButton[] {
    let end = buttons.length;
    while (end > 0 && this.isEffectivelyEmpty(buttons[end - 1]!)) {
      end -= 1;
    }
    return buttons.slice(0, end);
  }

  private isEffectivelyEmpty(btn: TouchButton): boolean {
    const isEmptyText = (btn.displayText ?? '').trim().length === 0;

    if (!isEmptyText) return false;
    if (btn.fontColor != null) return false;

    if (btn.action !== 'empty') return false;

    if (btn.gotoLayoutNo != null) return false;
    if (btn.posKeyCode != null) return false;
    if (btn.posKeyFunction != null) return false;

    return true;
  }

  private nextFreeLayoutNo(doc: LayoutDocument): number {
    const used = new Set(doc.layouts.map((l) => l.menuLayoutNo));
    for (let n = 1; n < 10000; n += 1) {
      if (!used.has(n)) return n;
    }
    return doc.layouts.length + 1;
  }

  selectLayoutByNo(menuLayoutNo: number): void {
    const layouts = this.layouts();
    const index = layouts.findIndex((l) => l.menuLayoutNo === menuLayoutNo);
    if (index < 0) return;
    this.selectLayout(index);
  }

  copySelectedButton(): void {
    const btn = this.selectedButton();
    const idx = this.selectedButtonIndex();
    const layout = this.selectedLayout();

    // Nur echte Buttons kopieren (nicht aus gepaddeten Dummy-Slots).
    if (!btn || idx == null || !layout) return;
    if (idx >= layout.touchButtons.length) return;

    // Defensive copy
    this.buttonClipboard.set({ ...btn });
  }

  pasteToSelectedButton(): void {
    const clip = this.buttonClipboard();
    if (!clip) return;

    const doc = this.document();
    const btnIndex = this.selectedButtonIndex();
    if (!doc || btnIndex == null) return;
    if (btnIndex < 0 || btnIndex >= GRID_SIZE) return;

    const layouts = doc.layouts.slice();
    const layoutIndex = this.selectedLayoutIndex();
    const currentLayout = layouts[layoutIndex];
    if (!currentLayout) return;

    // Falls es den Index noch nicht gibt, vorher erzeugen.
    const nextButtons = currentLayout.touchButtons.slice(0, GRID_SIZE);
    if (btnIndex >= nextButtons.length) {
      for (let i = nextButtons.length; i <= btnIndex; i += 1) {
        nextButtons.push(createEmptyButton());
      }
    }

    const current = nextButtons[btnIndex] ?? createEmptyButton();
    const next = { ...clip };
    const isSame = JSON.stringify(current) === JSON.stringify(next);
    if (isSame) return;

    this.pushHistory(doc);

    nextButtons[btnIndex] = next;

    // Nach dem Paste ggf. trailing-empties trimmen (nur sinnvoll, wenn wir ans Ende gepastet haben).
    const trimmed = this.trimTrailingEmptyButtons(nextButtons);

    layouts[layoutIndex] = {
      ...currentLayout,
      touchButtons: trimmed,
    };

    this.document.set({ ...doc, layouts });
    this.dirty.set(true);
  }

  clearButtonClipboard(): void {
    this.buttonClipboard.set(null);
  }
}
