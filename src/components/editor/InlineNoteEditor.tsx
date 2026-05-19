import { KeyboardEvent, useEffect, useState } from "react";

type InlineNoteEditorProps = {
  note?: string;
  onCommit: (note: string) => void;
};

export function InlineNoteEditor({ note, onCommit }: InlineNoteEditorProps) {
  const [value, setValue] = useState(note ?? "");

  useEffect(() => setValue(note ?? ""), [note]);

  function commit() {
    if (value !== (note ?? "")) onCommit(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setValue(note ?? "");
      event.currentTarget.blur();
    }
  }

  return (
    <input
      className="note-input"
      aria-label="Description"
      placeholder="Add description"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
