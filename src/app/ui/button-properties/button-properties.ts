import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { LayoutEditorStore } from '../../state/layout-editor.store';
import { ButtonAction, ButtonColor, PosKeyCode, TouchButton } from '../../state/layout-model';

@Component({
  selector: 'app-button-properties',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatButtonModule,
  ],
  templateUrl: './button-properties.html',
  styleUrl: './button-properties.scss',
})
export class ButtonProperties {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(LayoutEditorStore);

  protected readonly selectedButton = this.store.selectedButton;
  protected readonly hasSelection = computed(() => this.selectedButton() != null);

  protected readonly form = this.fb.group({
    name: this.fb.control(''),
    color: this.fb.control<ButtonColor | null>(null),
    action: this.fb.control<ButtonAction>('empty', { validators: [Validators.required] }),

    // Action = nav
    gotoLayout: this.fb.control<number | null>(null),

    // Action = pos
    keyCode: this.fb.control<PosKeyCode | null>(null),
    keyFunction: this.fb.control<number | null>(null),
  });

  private readonly action = signal<ButtonAction>(this.form.controls.action.getRawValue());

  protected readonly selectedAction = computed(() => this.action());
  protected readonly isNav = computed(() => this.selectedAction() === 'nav');
  protected readonly isPos = computed(() => this.selectedAction() === 'pos');
  protected readonly canDelete = computed(() => this.store.selectedButtonIndex() != null);

  protected deleteSelected(): void {
    if (!this.canDelete()) return;
    this.store.deleteSelectedButton();
  }

  constructor() {
    // Selection -> Form
    effect(() => {
      const btn = this.selectedButton();
      if (!btn) {
        this.form.disable({ emitEvent: false });
        this.form.reset(
          {
            name: '',
            color: null,
            action: 'empty',
            gotoLayout: null,
            keyCode: null,
            keyFunction: null,
          },
          { emitEvent: false },
        );
        this.action.set('empty');
        return;
      }

      this.form.enable({ emitEvent: false });
      this.form.reset(
        {
          name: btn.displayText,
          color: btn.fontColor,
          action: btn.action,
          gotoLayout: btn.gotoLayoutNo,
          keyCode: btn.posKeyCode,
          keyFunction: btn.posKeyFunction,
        },
        { emitEvent: false },
      );
      this.action.set(btn.action);
    });

    // Form action -> local signal
    this.form.controls.action.valueChanges.subscribe((value) => {
      this.action.set((value ?? 'empty') as ButtonAction);
    });

    // Validators toggling
    effect(() => {
      const action = this.selectedAction();

      if (action === 'nav') {
        this.form.controls.gotoLayout.setValidators([Validators.required]);
        this.form.controls.keyCode.clearValidators();
        this.form.controls.keyFunction.clearValidators();

        this.form.controls.keyCode.setValue(null, { emitEvent: false });
        this.form.controls.keyFunction.setValue(null, { emitEvent: false });
      } else if (action === 'pos') {
        this.form.controls.keyCode.setValidators([Validators.required]);

        // KeyFunction darf leer sein. Wenn ein Wert gesetzt ist, muss er >= 1 sein.
        this.form.controls.keyFunction.setValidators([Validators.min(1)]);

        this.form.controls.gotoLayout.clearValidators();

        this.form.controls.gotoLayout.setValue(null, { emitEvent: false });
      } else {
        this.form.controls.gotoLayout.clearValidators();
        this.form.controls.keyCode.clearValidators();
        this.form.controls.keyFunction.clearValidators();

        this.form.controls.gotoLayout.setValue(null, { emitEvent: false });
        this.form.controls.keyCode.setValue(null, { emitEvent: false });
        this.form.controls.keyFunction.setValue(null, { emitEvent: false });
      }

      this.form.controls.gotoLayout.updateValueAndValidity({ emitEvent: false });
      this.form.controls.keyCode.updateValueAndValidity({ emitEvent: false });
      this.form.controls.keyFunction.updateValueAndValidity({ emitEvent: false });
    });

    // Form -> Store
    this.form.valueChanges.subscribe((value) => {
      if (!this.hasSelection()) return;

      // Wir erlauben bewusst leeren Namen und (bei POS) leere KeyFunction.
      // Daher blockieren wir nur, wenn es wirklich ein invalider Zustand ist.
      //if (this.form.invalid) return;

      const action = (value.action ?? 'empty') as ButtonAction;
      const patch: Partial<TouchButton> = {
        displayText: value.name ?? '',
        fontColor: value.color ?? null,
        action,
        gotoLayoutNo: action === 'nav' ? (value.gotoLayout ?? null) : null,
        posKeyCode: action === 'pos' ? (value.keyCode ?? null) : null,
        posKeyFunction: action === 'pos' ? (value.keyFunction ?? null) : null,
      };

      this.store.updateSelectedButton(patch);
    });
  }

  protected readonly layouts = computed(() =>
    this.store.layouts().slice().sort((a, b) => a.menuLayoutNo - b.menuLayoutNo),
  );
}
