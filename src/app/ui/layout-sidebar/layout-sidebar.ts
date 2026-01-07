import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { LayoutEditorStore } from '../../state/layout-editor.store';
import { MenuLayout } from '../../state/layout-model';

@Component({
  selector: 'app-layout-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './layout-sidebar.html',
  styleUrl: './layout-sidebar.scss',
})
export class LayoutSidebar {
  protected readonly store = inject(LayoutEditorStore);

  private readonly layoutsRaw = this.store.layouts;

  protected readonly layouts = computed((): readonly { readonly layout: MenuLayout; readonly storeIndex: number }[] => {
    const items = this.layoutsRaw().map((layout, storeIndex) => ({ layout, storeIndex }));
    return items.slice().sort((a, b) => a.layout.menuLayoutNo - b.layout.menuLayoutNo);
  });

  protected readonly hasDocument = computed(() => this.store.document() != null);

  protected readonly selectedViewIndex = computed(() => {
    const selectedStoreIndex = this.store.selectedLayoutIndex();
    const items = this.layouts();
    return items.findIndex((i) => i.storeIndex === selectedStoreIndex);
  });

  protected readonly selectedLayoutNo = computed(() => {
    const idx = this.selectedViewIndex();
    const item = idx >= 0 ? this.layouts()[idx] : null;
    return item?.layout.menuLayoutNo ?? null;
  });

  // Simple in-component confirm UI (no dialog dependency).
  protected readonly confirmDelete = signal(false);

  protected selectLayout(viewIndex: number): void {
    this.confirmDelete.set(false);
    const item = this.layouts()[viewIndex];
    if (!item) return;
    this.store.selectLayout(item.storeIndex);
  }

  protected createLayout(): void {
    this.confirmDelete.set(false);
    this.store.createLayout();
  }

  protected requestDelete(): void {
    if (!this.hasDocument()) return;
    this.confirmDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmDelete.set(false);
  }

  protected deleteLayout(): void {
    this.confirmDelete.set(false);
    this.store.deleteSelectedLayout();
  }
}
