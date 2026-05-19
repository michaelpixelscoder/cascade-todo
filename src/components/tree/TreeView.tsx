import { useState } from "react";
import { flattenTree } from "../../domain/tree";
import type { TodoNode } from "../../domain/nodes";
import { useTodoStore } from "../../store/todo-store";
import { TaskDetailsModal } from "../details/TaskDetailsModal";
import { TreeNodeRow } from "./TreeNodeRow";

type TreeViewProps = {
  nodes: TodoNode[];
  isFiltered: boolean;
};

export function TreeView({ nodes, isFiltered }: TreeViewProps) {
  const items = flattenTree(nodes);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const moveToRoot = useTodoStore((state) => state.moveToRoot);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  if (!items.length) {
    return <div className="empty-state">{isFiltered ? "No matching nodes." : "Write the first task."}</div>;
  }

  return (
    <>
      <div
        className="root-drop-zone"
        data-active={Boolean(draggingId)}
        onDragOver={(event) => {
          if (!draggingId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const droppedId = event.dataTransfer.getData("text/plain") || draggingId;
          if (droppedId) moveToRoot(droppedId);
          setDraggingId(null);
        }}
      >
        Drop here for root
      </div>
      <div className="tree-view" role="tree">
        {items.map((item) => (
          <TreeNodeRow
            key={item.node.id}
            item={item}
            nodes={nodes}
            draggingId={draggingId}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onOpenDetails={setSelectedNodeId}
          />
        ))}
      </div>
      {selectedNode && (
        <TaskDetailsModal
          node={selectedNode}
          nodes={nodes}
          onSelectTask={setSelectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </>
  );
}
