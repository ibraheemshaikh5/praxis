"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type EditableTextProps = {
  value: string;
  onChange: (value: string) => void;
  onCancel?: () => void;
  onEnter?: () => void;
  placeholder?: string;
  variant: "title" | "notes";
  completed?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  className?: string;
};

/**
 * Seamless auto-growing textarea that reads like a paragraph until focused.
 * Height tracks scrollHeight so multi-line notes never clip. Commit/discard
 * is owned by the parent row so focus can move between title and notes
 * without a premature save.
 */
export const EditableText = React.forwardRef<
  HTMLTextAreaElement,
  EditableTextProps
>(function EditableText(
  {
    value,
    onChange,
    onCancel,
    onEnter,
    placeholder,
    variant,
    completed = false,
    disabled = false,
    autoFocus = false,
    "aria-label": ariaLabel,
    className,
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(forwardedRef, () => innerRef.current!);

  const resize = React.useCallback(() => {
    const node = innerRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  React.useEffect(() => {
    if (autoFocus) innerRef.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      aria-label={ariaLabel}
      className={cn(
        "block w-full resize-none overflow-hidden bg-transparent p-0 outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:outline-none",
        variant === "title" && "text-[15px] font-medium leading-5",
        variant === "notes" && "text-sm leading-5 text-muted-foreground",
        completed && "text-muted-foreground line-through",
        disabled && "cursor-default",
        className,
      )}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel?.();
          return;
        }

        if (event.key === "Enter" && !event.shiftKey && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      ref={innerRef}
      rows={1}
      value={value}
    />
  );
});
