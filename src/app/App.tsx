import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronsUp, Menu, Plus, Search, X } from "lucide-react";
import { QuickAdd } from "../components/editor/QuickAdd";
import { TreeView } from "../components/tree/TreeView";
import { useTodoStore } from "../store/todo-store";

export function App() {
  const { nodes, hydrate, hydrated, addNode, expandAll, collapseAll } = useTodoStore();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const stats = useMemo(() => {
    const done = nodes.filter((node) => node.status === "done").length;
    const open = nodes.length - done;
    return { done, open, total: nodes.length };
  }, [nodes]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    function closeOpenMenus(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("details")) return;
      document.querySelectorAll("details[open]").forEach((details) => {
        details.removeAttribute("open");
      });
    }

    document.addEventListener("click", closeOpenMenus);
    return () => document.removeEventListener("click", closeOpenMenus);
  }, []);

  const filteredNodes = useMemo(() => {
    if (!query.trim()) return nodes;
    const normalized = query.trim().toLowerCase();
    const matchingIds = new Set(
      nodes
        .filter((node) => `${node.title} ${node.note ?? ""}`.toLowerCase().includes(normalized))
        .map((node) => node.id),
    );
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of nodes) {
        if (matchingIds.has(node.id) && node.parentId && !matchingIds.has(node.parentId)) {
          matchingIds.add(node.parentId);
          grew = true;
        }
      }
    }
    return nodes.filter((node) => matchingIds.has(node.id));
  }, [nodes, query]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button
          className="icon-button menu-button"
          aria-label={menuOpen ? "Close menu" : "Menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1>Cascade Todo</h1>
        <div className="quick-search">
          <Search size={19} />
          <input
            aria-label="Search or quick add"
            placeholder="Quick add"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
                event.preventDefault();
                addNode(query || "New task");
                setQuery("");
              }
            }}
          />
          <kbd>⌘ + N</kbd>
        </div>
        <button
          className="icon-button add-button"
          aria-label="Add task"
          onClick={() => addNode(query || "New task")}
        >
          <Plus size={25} />
        </button>
      </header>

      {menuOpen && (
        <div className="menu-layer">
          <button className="menu-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="app-menu" aria-label="App menu">
            <div className="menu-summary">
              <span>{stats.open} open</span>
              <span>{stats.done} done</span>
              <span>{stats.total} total</span>
            </div>
            <button
              className="menu-command"
              onClick={() => {
                addNode("New task");
                setMenuOpen(false);
              }}
            >
              <Plus size={18} />
              <span>New root task</span>
            </button>
            <button className="menu-command" onClick={expandAll}>
              <ChevronDown size={18} />
              <span>Expand all</span>
            </button>
            <button className="menu-command" onClick={collapseAll}>
              <ChevronsUp size={18} />
              <span>Collapse all</span>
            </button>
          </aside>
        </div>
      )}

      <section className="mobile-capture">
        <QuickAdd />
      </section>

      <section className="workspace">
        {!hydrated ? (
          <div className="loading-state">Loading local todo log...</div>
        ) : (
          <TreeView nodes={filteredNodes} isFiltered={Boolean(query.trim())} />
        )}
      </section>
    </main>
  );
}
