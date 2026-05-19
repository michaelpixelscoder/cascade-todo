import { KeyboardEvent, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type InlineTitleEditorProps = {
  title: string;
  done?: boolean;
  onCommit: (title: string) => void;
  onEnter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleDone: () => void;
};

export function InlineTitleEditor({
  title,
  done,
  onCommit,
  onEnter,
  onMoveUp,
  onMoveDown,
  onToggleDone,
}: InlineTitleEditorProps) {
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(title), [title]);

  function commit() {
    if (value !== title) onCommit(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      onEnter();
    }
    if (event.key === " " && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onToggleDone();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
      event.preventDefault();
      onMoveUp();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowDown") {
      event.preventDefault();
      onMoveDown();
    }
  }

  return (
    <input
      ref={inputRef}
      className="title-input"
      data-done={done}
      style={{ "--title-ch": Math.min(Math.max(value.length + 1, 12), 72) } as CSSProperties}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
