import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { LayoutEditorStore } from '../../state/layout-editor.store';

@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatIconModule, MatButtonModule, MatDividerModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class Toolbar {
  private readonly store = inject(LayoutEditorStore);
  private readonly router = inject(Router);

  protected readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly isTemplateInputOpen = signal(false);
  protected readonly templateName = signal('');
  protected readonly templateInput = viewChild<ElementRef<HTMLInputElement>>('templateInput');

  protected readonly canLoadTemplate = computed(() => this.templateName().trim().length > 0);

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(): Promise<void> {
    const input = this.fileInput().nativeElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    const text = await file.text();
    this.store.loadFromXmlText(text);

    // Reset, damit dieselbe Datei nochmal gewählt werden kann.
    input.value = '';
  }

  protected createNew(): void {
    this.store.newDocument();
  }

  protected download(): void {
    const xml = this.store.exportXml();
    if (!xml) return;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'template.xml';
    a.rel = 'noopener';
    a.click();

    URL.revokeObjectURL(url);
  }

  protected toggleTemplateInput(): void {
    const next = !this.isTemplateInputOpen();
    this.isTemplateInputOpen.set(next);

    if (next) {
      queueMicrotask(() => {
        this.templateInput()?.nativeElement.focus();
        this.templateInput()?.nativeElement.select();
      });
    }
  }

  protected closeTemplateInput(): void {
    this.isTemplateInputOpen.set(false);
  }

  protected onTemplateKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.loadTemplate();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeTemplateInput();
    }
  }

  protected loadTemplate(): void {
    const name = this.templateName().trim();
    if (!name.length) return;

    // URL spiegeln (ohne Reload) -> ?template=NAME
    void this.router.navigate([], {
      queryParams: { template: name },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    void this.store.loadTemplate(name);
    this.closeTemplateInput();
  }

  protected readonly canUndo = this.store.canUndo;
  protected readonly canRedo = this.store.canRedo;

  protected undo(): void {
    this.store.undo();
  }

  protected redo(): void {
    this.store.redo();
  }

  protected readonly canCopyButton = computed(() => {
    const idx = this.store.selectedButtonIndex();
    const layout = this.store.selectedLayout();
    return idx != null && layout != null && idx < layout.touchButtons.length;
  });

  protected readonly canPasteButton = this.store.canPasteButton;

  protected copyButton(): void {
    this.store.copySelectedButton();
  }

  protected pasteButton(): void {
    this.store.pasteToSelectedButton();
  }

  constructor() {
    effect((onCleanup) => {
      const handler = (event: KeyboardEvent) => {
        // Nicht in Inputs/Textareas eingreifen.
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isEditable = tag === 'input' || tag === 'textarea' || (target as HTMLElement | null)?.isContentEditable;
        if (isEditable) return;

        const key = event.key.toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;
        if (!ctrlOrMeta) return;

        // Copy/Paste (TouchButton)
        if (key === 'c') {
          // Nur wenn ein Button selektiert ist.
          if (this.store.selectedButtonIndex() != null) {
            event.preventDefault();
            this.store.copySelectedButton();
          }
          return;
        }

        if (key === 'v') {
          if (this.store.selectedButtonIndex() != null && this.store.canPasteButton()) {
            event.preventDefault();
            this.store.pasteToSelectedButton();
          }
          return;
        }

        if (key === 'z' && event.shiftKey) {
          event.preventDefault();
          this.store.redo();
          return;
        }

        if (key === 'z') {
          event.preventDefault();
          this.store.undo();
          return;
        }

        if (key === 'y') {
          event.preventDefault();
          this.store.redo();
        }
      };

      window.addEventListener('keydown', handler, { passive: false });
      onCleanup(() => window.removeEventListener('keydown', handler));
    });
  }
}
