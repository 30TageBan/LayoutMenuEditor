export type ButtonAction = 'nav' | 'pos' | 'empty';

export type ButtonColor = 'BLACK' | 'ORANGE' | 'BLUE' | 'PURPLE';

export type PosKeyCode = 'a' | 'w';

export interface TouchButton {
  readonly displayText: string;
  readonly fontColor: ButtonColor | null;
  readonly action: ButtonAction;

  // action = nav
  readonly gotoLayoutNo: number | null;

  // action = pos
  readonly posKeyCode: PosKeyCode | null;
  readonly posKeyFunction: number | null;
}

export interface MenuLayout {
  readonly menuLayoutNo: number;
  readonly displayText: string;
  readonly dontClose: boolean;

  /** Variable Anzahl Buttons; die UI zeigt max. GRID_SIZE Slots. */
  readonly touchButtons: readonly TouchButton[];
}

export interface LayoutDocument {
  readonly layouts: readonly MenuLayout[];
}

export const GRID_ROWS = 6;
export const GRID_COLS = 3;
export const GRID_SIZE = GRID_ROWS * GRID_COLS;

export function createEmptyButton(): TouchButton {
  return {
    displayText: '',
    fontColor: null,
    action: 'empty',
    gotoLayoutNo: null,
    posKeyCode: null,
    posKeyFunction: null,
  };
}

export function padButtonsToGrid(buttons: readonly TouchButton[]): readonly TouchButton[] {
  const normalized = buttons.slice(0, GRID_SIZE);
  if (normalized.length === GRID_SIZE) return normalized;
  return [...normalized, ...Array.from({ length: GRID_SIZE - normalized.length }, () => createEmptyButton())];
}
