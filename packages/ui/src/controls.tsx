import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export function Disclosure({
  title,
  children,
  className = "",
  hidden = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={`disclosure ${className}`} hidden={hidden}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <ChevronDown
          className={open ? "disclosure-chevron is-open" : "disclosure-chevron"}
          size={18}
          aria-hidden="true"
        />
      </button>
      <div className="disclosure-content" id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

type Option = { value: string; label: ReactNode; disabled?: boolean };
function optionsFrom(children: ReactNode): Option[] {
  const result: Option[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.type === Fragment)
      result.push(...optionsFrom(child.props.children));
    else if (child.type === "option")
      result.push({
        value: String(child.props.value ?? child.props.children ?? ""),
        label: child.props.children,
        disabled: child.props.disabled,
      });
  });
  return result;
}
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsFrom(children);
  const [internal, setInternal] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const listId = useId();
  const selected = String(value ?? internal);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    const form = select.current?.form;
    const reset = () => {
      setInternal(String(defaultValue ?? options[0]?.value ?? ""));
      setOpen(false);
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, children]);
  function choose(option: Option) {
    if (option.disabled || !select.current) return;
    setInternal(option.value);
    const element = select.current;
    element.value = option.value;
    onChange?.({
      target: element,
      currentTarget: element,
    } as React.ChangeEvent<HTMLSelectElement>);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }
  return (
    <span
      ref={root}
      className="custom-select relative block min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.stopPropagation();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          const enabled = options.filter((o) => !o.disabled);
          const index = enabled.findIndex((o) => o.value === selected);
          const next =
            enabled[
              (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
                enabled.length
            ];
          if (next) choose(next);
        }
      }}
    >
      <select
        {...props}
        ref={select}
        value={selected}
        onChange={() => {}}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="native-select-proxy"
      >
        {children}
      </select>
      <button
        type="button"
        className="custom-select-trigger flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left"
        aria-label={props["aria-label"]}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span>
          {options.find((o) => o.value === selected)?.label ??
            "Select an option"}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={listId}
          role="listbox"
          aria-label={props["aria-label"]}
          className="custom-select-menu absolute z-50 mt-1 block w-full overflow-y-auto rounded-lg border bg-white p-1 shadow-xl"
        >
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === selected}
              disabled={option.disabled}
              key={`${option.value}-${index}`}
              className="custom-select-option flex w-full items-center justify-between rounded-md px-3 py-2 text-left"
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === selected && (
                <Check size={15} aria-hidden="true" />
              )}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function FilePicker(props: InputHTMLAttributes<HTMLInputElement>) {
  const [filename, setFilename] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setFilename("");
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return (
    <span className="custom-file relative flex w-full items-center gap-3 rounded-lg border bg-white p-2">
      <span className="custom-file-button rounded-md px-3 py-2 font-semibold">
        Choose image
      </span>
      <span className="custom-file-name truncate">
        {filename || "No file selected"}
      </span>
      <input
        {...props}
        ref={input}
        type="file"
        className="custom-file-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => {
          setFilename(event.currentTarget.files?.[0]?.name ?? "");
          props.onChange?.(event);
        }}
      />
    </span>
  );
}
