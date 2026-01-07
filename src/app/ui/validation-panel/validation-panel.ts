import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { LayoutEditorStore } from '../../state/layout-editor.store';
import { MenuLayout } from '../../state/layout-model';

type ValidationIssue = {
  readonly level: 'error' | 'warning';
  readonly message: string;
};

@Component({
  selector: 'app-validation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule],
  templateUrl: './validation-panel.html',
  styleUrl: './validation-panel.scss',
})
export class ValidationPanel {
  private readonly store = inject(LayoutEditorStore);

  protected readonly hasDocument = computed(() => this.store.document() != null);
  private readonly layouts = this.store.layouts;

  protected readonly issues = computed<readonly ValidationIssue[]>(() => {
    const layouts = this.layouts();
    if (!layouts.length) return [];

    const issues: ValidationIssue[] = [];

    // Layout 0 muss existieren.
    if (!layouts.some((l) => l.menuLayoutNo === 0)) {
      issues.push({ level: 'error', message: 'Layout Nr. 0 (Hauptmenü) fehlt.' });
    }

    // LayoutNr eindeutig.
    const seen = new Map<number, MenuLayout[]>();
    for (const l of layouts) {
      const list = seen.get(l.menuLayoutNo) ?? [];
      list.push(l);
      seen.set(l.menuLayoutNo, list);
    }
    for (const [no, list] of seen.entries()) {
      if (list.length > 1) {
        issues.push({ level: 'error', message: `Layout Nr. ${no} kommt mehrfach vor (${list.length}×).` });
      }
    }

    // GoToLayoutNo Ziele prüfen.
    const existingNos = new Set(layouts.map((l) => l.menuLayoutNo));
    for (const layout of layouts) {
      layout.touchButtons.forEach((btn, idx) => {
        if (btn.action === 'nav' && btn.gotoLayoutNo != null && !existingNos.has(btn.gotoLayoutNo)) {
          issues.push({
            level: 'warning',
            message: `Layout #${layout.menuLayoutNo}: Button ${idx + 1} verweist auf fehlendes Layout #${btn.gotoLayoutNo}.`,
          });
        }
        if (btn.action === 'pos') {
          if (!btn.posKeyCode || btn.posKeyFunction == null) {
            issues.push({
              level: 'warning',
              message: `Layout #${layout.menuLayoutNo}: Button ${idx + 1} (POS) ist unvollständig (KeyCode/KeyFunction).`,
            });
          }
        }
      });
    }

    return issues;
  });

  protected readonly hasIssues = computed(() => this.issues().length > 0);
  protected readonly errorCount = computed(() => this.issues().filter((i) => i.level === 'error').length);
  protected readonly warningCount = computed(() => this.issues().filter((i) => i.level === 'warning').length);
}

export {};
