import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Toolbar } from './ui/toolbar/toolbar';
import { Layout } from './ui/layout/layout';
import { ButtonProperties } from './ui/button-properties/button-properties';
import { LayoutSidebar } from './ui/layout-sidebar/layout-sidebar';
import { MenuProperties } from './ui/menu-properties/menu-properties';
import { LayoutEditorStore } from './state/layout-editor.store';
import { ValidationPanel } from './ui/validation-panel/validation-panel';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toolbar, LayoutSidebar, MenuProperties, ButtonProperties, ValidationPanel, Layout],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  protected readonly store = inject(LayoutEditorStore);

  protected readonly sidebarToggle = viewChild<ElementRef<HTMLButtonElement>>('sidebarToggle');
  protected readonly validationToggle = viewChild<ElementRef<HTMLButtonElement>>('validationToggle');

  protected readonly isSidebarCollapsed = signal(this.readBool('ui.sidebarCollapsed', false));
  protected readonly isValidationCollapsed = signal(this.readBool('ui.validationCollapsed', false));

  protected toggleSidebar(): void {
    const next = !this.isSidebarCollapsed();
    this.isSidebarCollapsed.set(next);
    this.writeBool('ui.sidebarCollapsed', next);

    // Bei Einklappen Fokus am Toggle lassen.
    queueMicrotask(() => this.sidebarToggle()?.nativeElement.focus());
  }

  protected toggleValidation(): void {
    const next = !this.isValidationCollapsed();
    this.isValidationCollapsed.set(next);
    this.writeBool('ui.validationCollapsed', next);

    queueMicrotask(() => this.validationToggle()?.nativeElement.focus());
  }

  private readBool(key: string, fallback: boolean): boolean {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return raw === '1';
    } catch {
      return fallback;
    }
  }

  private writeBool(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      // ignore
    }
  }

  constructor() {
    // Reagiere auf URL-Änderungen, damit ?template=drw_1 auch bei Navigation greift.
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      const tree = this.router.parseUrl(this.router.url);
      const template = tree.queryParams['template'];
      if (typeof template === 'string' && template.length) {
        void this.store.loadTemplate(template);
      }
    });

    // Initiale URL auswerten.
    effect(() => {
      const tree = this.router.parseUrl(this.router.url);
      const template = tree.queryParams['template'];
      if (typeof template === 'string' && template.length) {
        void this.store.loadTemplate(template);
      }
    });

    // UX-Härtefall: Contextmenu + gängige DevTools Shortcuts unterdrücken.
    // Hinweis: Das ist keine echte Security-Maßnahme, sondern nur eine Hürde.
    effect((onCleanup) => {
      const isEditableTarget = (target: EventTarget | null): boolean => {
        const el = target instanceof HTMLElement ? target : null;
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
      };

      const onContextMenu = (event: MouseEvent) => {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (isEditableTarget(event.target)) return;

        // F12
        if (event.key === 'F12') {
          event.preventDefault();
          return;
        }

        const key = event.key.toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;

        // Ctrl+U (View Source)
        if (ctrlOrMeta && key === 'u') {
          event.preventDefault();
          return;
        }

        // Ctrl+Shift+I/J/C/K (DevTools)
        if (ctrlOrMeta && event.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) {
          event.preventDefault();
        }
      };

      window.addEventListener('contextmenu', onContextMenu, { capture: true });
      window.addEventListener('keydown', onKeyDown, { passive: false });

      onCleanup(() => {
        window.removeEventListener('contextmenu', onContextMenu, { capture: true } as EventListenerOptions);
        window.removeEventListener('keydown', onKeyDown as EventListener);
      });
    });
  }
}
