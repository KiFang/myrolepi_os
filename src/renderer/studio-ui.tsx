import { Children, isValidElement } from "react";
import type { ComponentProps } from "react";

export function StudioMark({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? "studio-mark large" : "studio-mark"}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Логотип MyRolePi"
    >
      <path fill="#587fff" d="M20 2 37 12v16L20 38 3 28V12Z" />
      <path fill="#8ba7ff" d="m20 2 0 18L3 12Z" />
      <path fill="#385bd0" d="m20 20 17 8-17 10Z" />
      <path
        fill="none"
        stroke="#d5dfff"
        strokeWidth="1.2"
        d="m3 12 17 8 17-8M20 20v18"
      />
      <path
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
        d="M12 14v9m0-9 8 7 8-7v9"
      />
    </svg>
  );
}
const paths = {
  plus: "M12 4v16M4 12h16",
  system: "m12 3 9 5v8l-9 5-9-5V8Zm0 0v9m-9-4 9 4 9-4m-9 4v9",
  campaign: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  dice: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 7h.01M12 12h.01M17 17h.01",
  formula: "M17 4h-4l-3 16H6M6 10h10",
  plugin: "M8 3v5m8-5v5M6 8h12v5a6 6 0 0 1-12 0Zm6 11v3",
  help: "M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4Zm8 2v15",
  save: "M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8",
  undo: "M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4",
  redo: "m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v4",
  check: "m5 12 4 4L19 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  close: "m6 6 12 12M6 18 18 6",
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="studio-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
/** Keep native keyboard/accessibility behavior; render the selected label consistently across desktop WebViews. */
export function StudioSelect({ children, ...props }: ComponentProps<"select">) {
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string | number; children: React.ReactNode }>,
  );
  const selected =
    options.find((o) => String(o.props.value) === String(props.value)) ??
    options[0];
  return (
    <span className="studio-select">
      <span aria-hidden="true">{selected?.props.children}</span>
      <span className="studio-chevron" aria-hidden="true">
        ⌄
      </span>
      <select {...props}>{children}</select>
    </span>
  );
}
