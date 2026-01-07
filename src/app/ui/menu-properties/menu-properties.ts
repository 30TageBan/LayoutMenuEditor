import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { LayoutEditorStore } from '../../state/layout-editor.store';

@Component({
  selector: 'app-menu-properties',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule],
  templateUrl: './menu-properties.html',
  styleUrl: './menu-properties.scss',
})
export class MenuProperties {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(LayoutEditorStore);

  protected readonly selectedLayout = this.store.selectedLayout;
  protected readonly hasLayout = computed(() => this.selectedLayout() != null);
  protected readonly storeError = this.store.error;

  protected readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required] }),
    number: this.fb.control<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
    dontClose: this.fb.control(false),
  });

  constructor() {
    // Store error -> Form hint (Duplicate Nr)
    effect(() => {
      const err = this.storeError();
      if (err && err.includes('Layout-Nr')) {
        this.form.controls.number.setErrors({ duplicate: true });
      } else {
        // Nur unseren duplicate-Error entfernen (andere Validatoren bleiben).
        const currentErrors = this.form.controls.number.errors;
        if (currentErrors?.['duplicate']) {
          const { duplicate, ...rest } = currentErrors;
          this.form.controls.number.setErrors(Object.keys(rest).length ? rest : null);
        }
      }
    });

    // Selection -> Form
    effect(() => {
      const layout = this.selectedLayout();
      if (!layout) {
        this.form.disable({ emitEvent: false });
        this.form.reset({ name: '', number: null, dontClose: false }, { emitEvent: false });
        return;
      }

      this.form.enable({ emitEvent: false });
      this.form.reset(
        {
          name: layout.displayText,
          number: layout.menuLayoutNo,
          dontClose: layout.dontClose,
        },
        { emitEvent: false },
      );
    });

    // Form -> Store
    this.form.valueChanges.subscribe((value) => {
      if (!this.hasLayout()) return;
      if (this.form.invalid) return;

      this.store.updateSelectedLayout({
        displayText: value.name ?? '',
        menuLayoutNo: value.number ?? 1,
        dontClose: value.dontClose ?? false,
      });
    });
  }
}
