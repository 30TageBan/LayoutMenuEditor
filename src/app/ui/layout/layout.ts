import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { CdkDragDrop, CdkDragStart, DragDropModule, Point } from '@angular/cdk/drag-drop';
import { LayoutEditorStore } from '../../state/layout-editor.store';
import { GRID_COLS, GRID_ROWS, GRID_SIZE, TouchButton } from '../../state/layout-model';

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, DragDropModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  protected readonly store = inject(LayoutEditorStore);

  protected readonly rows = GRID_ROWS;
  protected readonly cols = GRID_COLS;
  protected readonly size = GRID_SIZE;

  protected readonly selectedIndex = this.store.selectedButtonIndex;

  /** Für die Anzeige immer auf GRID_SIZE gepaddet. */
  protected readonly buttons = this.store.gridButtons;

  protected readonly hasDocument = computed(() => this.store.document() != null);

  private readonly rawButtons = computed(() => this.store.selectedLayout()?.touchButtons ?? []);

  protected slotExists(index: number): boolean {
    return index < this.rawButtons().length;
  }

  protected select(index: number): void {
    if (!this.slotExists(index)) return;
    this.store.selectButton(index);
  }

  protected createAt(index: number): void {
    this.store.createButtonAt(index);
  }
  protected create(): void {
    const index = this.rawButtons().length;
    if (index > 0) {
      this.store.selectButton(index - 1);
    }
    this.store.createButtonAt(index);
  }

  protected labelFor(index: number): string {
    if (!this.slotExists(index)) {
      return `Button ${index + 1}: erstellen`;
    }

    const btn = this.buttons()[index];
    const text = btn?.displayText?.trim();
    return text ? `Button ${index + 1}: ${text}` : `Button ${index + 1}: leer`;
  }

  protected onDrop(event: CdkDragDrop<readonly TouchButton[]>): void {
    const dragged = event.item.data as TouchButton | undefined;
    if (!dragged) return;

    const real = this.rawButtons();
    const len = real.length;
    if (!len) return;

    const from = real.indexOf(dragged);
    if (from < 0) return;

    const slotTo = this.slotIndexFromPoint(event);
    if (slotTo == null) return;

    // Slot (0..GRID_SIZE-1) -> realer Index (0..len-1)
    let to = Math.min(slotTo, len - 1);
    if (!this.slotExists(slotTo)) {
      to = len - 1;
    }

    if (from === to) return;

    this.store.reorderButtons(from, to);
  }

  private slotIndexFromPoint(event: CdkDragDrop<readonly TouchButton[]>): number | null {
    const point = this.getDropPoint(event);
    if (!point) return null;

    const el = event.container.element.nativeElement as HTMLElement;
    const rect = el.getBoundingClientRect();

    const x = point.x - rect.left;
    const y = point.y - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      // Wenn außerhalb gedroppt wird, interpretieren wir als "ans Ende".
      return GRID_SIZE - 1;
    }

    // Bestimme Grid-Spaltenbreite über BoundingRect, funktioniert unabhängig von Gap.
    const colWidth = rect.width / GRID_COLS;
    const rowHeight = rect.height / GRID_ROWS;

    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(x / colWidth)));
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / rowHeight)));

    return row * GRID_COLS + col;
  }

  private getDropPoint(event: CdkDragDrop<readonly TouchButton[]>): Point | null {
    // CDK liefert dropPoint in neueren Versionen.
    const anyEvent = event as unknown as { readonly dropPoint?: Point };
    return anyEvent.dropPoint ?? null;
  }

  protected onDragStarted(event: CdkDragStart<TouchButton>): void {
    // Sicherstellen, dass das Drag-Item Daten trägt.
    void event;
  }

  protected onCellKeydown(event: KeyboardEvent, index: number): void {
    if (!this.slotExists(index)) return;

    const isAlt = event.altKey;
    if (!isAlt) return;

    let target = index;

    switch (event.key) {
      case 'ArrowLeft':
        target = Math.max(0, index - 1);
        break;
      case 'ArrowRight':
        target = Math.min(this.rawButtons().length - 1, index + 1);
        break;
      case 'ArrowUp':
        target = Math.max(0, index - GRID_COLS);
        break;
      case 'ArrowDown':
        target = Math.min(this.rawButtons().length - 1, index + GRID_COLS);
        break;
      default:
        return;
    }

    if (target === index) return;

    event.preventDefault();
    this.store.reorderButtons(index, target);
    this.store.selectButton(target);
  }

  protected openGoto(index: number): void {
    if (!this.slotExists(index)) return;

    const btn = this.buttons()[index];
    if (!btn) return;

    if (btn.action === 'nav' && btn.gotoLayoutNo != null) {
      this.store.selectLayoutByNo(btn.gotoLayoutNo);
    }
  }
}
