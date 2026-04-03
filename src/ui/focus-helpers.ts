type FocusableControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface NamedControlFocusState {
  controlName: string;
}

const textCaretInputTypes = new Set([
  "email",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

function isFocusableControl(value: Element | null): value is FocusableControl {
  return value instanceof HTMLInputElement
    || value instanceof HTMLTextAreaElement
    || value instanceof HTMLSelectElement;
}

function supportsTextCaret(control: FocusableControl): control is HTMLInputElement | HTMLTextAreaElement {
  if (control instanceof HTMLTextAreaElement) {
    return true;
  }

  return control instanceof HTMLInputElement && textCaretInputTypes.has(control.type);
}

export function focusControlAtEnd(control: FocusableControl | null | undefined): void {
  if (!control) {
    return;
  }

  control.focus();
  if (!supportsTextCaret(control)) {
    return;
  }

  const end = control.value.length;
  try {
    control.setSelectionRange(end, end);
  } catch {
    // Keep focus even when the control does not support selection APIs.
  }
}

export function captureNamedControlFocus(root: HTMLElement): NamedControlFocusState | null {
  const activeElement = document.activeElement;
  if (!isFocusableControl(activeElement) || !root.contains(activeElement) || !activeElement.name) {
    return null;
  }

  return {
    controlName: activeElement.name,
  };
}

export function restoreNamedControlFocus(root: HTMLElement, focusState: NamedControlFocusState | null): void {
  if (!focusState) {
    return;
  }

  const nextControl = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[name]"),
  ).find((control) => control.name === focusState.controlName);
  if (!nextControl) {
    return;
  }

  window.requestAnimationFrame(() => {
    focusControlAtEnd(nextControl);
  });
}
