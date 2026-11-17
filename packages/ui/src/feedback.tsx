import { useEffect, useRef, useState } from "react";

type Confirmation = {
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
};
const eventName = "knowngdb-confirm";
let errorId = 0;
export function confirmAction(
  message: string,
  options?: { title?: string; confirmLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent<Confirmation>(eventName, {
        detail: {
          message,
          resolve,
          title: options?.title ?? "Discard changes?",
          confirmLabel: options?.confirmLabel ?? "Discard changes",
          cancelLabel: options?.cancelLabel ?? "Keep editing",
        },
      }),
    ),
  );
}
export function FeedbackHost() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const listener = (event: Event) =>
      setConfirmation((event as CustomEvent<Confirmation>).detail);
    const invalid = (event: Event) => {
      const field = event.target as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (!(field instanceof HTMLElement)) return;
      event.preventDefault();
      showFieldError(field);
      const form = field.form;
      if (
        form &&
        Array.from(form.elements).find(
          (item) =>
            item instanceof HTMLElement &&
            "validity" in item &&
            !(item as HTMLInputElement).validity.valid,
        ) === field
      ) {
        const section = field.closest<HTMLElement>("[data-editor-section]")
          ?.dataset.editorSection;
        if (section) {
          const tab = section === "localizations" ? "overview" : section;
          const label =
            tab === "review"
              ? "Review & save"
              : tab[0].toUpperCase() + tab.slice(1);
          Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              ".metadata-editor nav button",
            ),
          )
            .find((button) => button.textContent?.trim() === label)
            ?.click();
        }
        requestAnimationFrame(() =>
          (field.classList.contains("native-select-proxy")
            ? field.parentElement?.querySelector<HTMLButtonElement>("button")
            : field
          )?.focus(),
        );
      }
    };
    const clear = (event: Event) => {
      const field = event.target as HTMLElement;
      if (!field?.closest) return;
      const label = field.closest("label");
      label?.querySelector(".field-error")?.remove();
      label?.querySelectorAll('[aria-invalid="true"]').forEach((item) => {
        item.removeAttribute("aria-invalid");
        item.removeAttribute("aria-describedby");
      });
    };
    window.addEventListener(eventName, listener);
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      window.removeEventListener(eventName, listener);
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, []);
  useEffect(() => {
    if (confirmation) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      cancel.current?.focus();
    }
  }, [confirmation]);
  if (!confirmation) return null;
  const close = (answer: boolean) => {
    confirmation.resolve(answer);
    setConfirmation(null);
    requestAnimationFrame(
      () => previousFocus.current?.isConnected && previousFocus.current.focus(),
    );
  };
  return (
    <div
      className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(false);
        }
        if (event.key === "Tab") {
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
          if (event.shiftKey && document.activeElement === buttons[0]) {
            event.preventDefault();
            buttons[buttons.length - 1]?.focus();
          } else if (
            !event.shiftKey &&
            document.activeElement === buttons[buttons.length - 1]
          ) {
            event.preventDefault();
            buttons[0]?.focus();
          }
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="modal-panel w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title">{confirmation.title}</h2>
        <p id="confirm-message">{confirmation.message}</p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancel}
            className="secondary"
            type="button"
            onClick={() => close(false)}
          >
            {confirmation.cancelLabel}
          </button>
          <button type="button" onClick={() => close(true)}>
            {confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
export function showFieldError(
  field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  const label = field.closest("label");
  if (!label) return;
  const target = field.classList.contains("native-select-proxy")
    ? (label.querySelector<HTMLElement>(".custom-select-trigger") ?? field)
    : field;
  target.setAttribute("aria-invalid", "true");
  let error = label.querySelector<HTMLElement>(".field-error");
  if (!error) {
    error = document.createElement("span");
    error.className = "field-error";
    error.setAttribute("role", "alert");
    error.id = `field-error-${++errorId}`;
    label.appendChild(error);
  }
  target.setAttribute("aria-describedby", error.id);
  const validity = field.validity;
  error.textContent = validity.customError
    ? field.validationMessage
    : validity.valueMissing
      ? field instanceof HTMLInputElement && field.type === "checkbox"
        ? "Please confirm this choice."
        : "This field is required."
      : validity.typeMismatch
        ? "Enter a valid value."
        : validity.patternMismatch
          ? "Use the requested format."
          : validity.tooShort
            ? "Enter more characters."
            : validity.rangeUnderflow || validity.rangeOverflow
              ? "Enter a value within the allowed range."
              : "Please check this field.";
}
