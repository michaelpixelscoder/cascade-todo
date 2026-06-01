import { FormEvent, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useTodoStore } from "../../store/todo-store";

export function QuickAdd() {
  const addNode = useTodoStore((state) => state.addNode);
  const [title, setTitle] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    addNode(title || "New task");
    setTitle("");
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <Search size={24} />
      <input
        aria-label="Quick add"
        placeholder="Quick add"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" aria-label="Add task">
        <Plus size={22} />
      </button>
    </form>
  );
}
