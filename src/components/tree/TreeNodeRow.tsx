import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, GripVertical, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { getDependencyState } from "../../domain/cascade";
import type { TodoNode } from "../../domain/nodes";
import type { TreeItem } from "../../domain/tree";
import { useTodoStore } from "../../store/todo-store";
import { TaskListItem } from "../task/TaskListItem";
import { DependencyWarning } from "./DependencyWarning";

type TreeNodeRowProps = {
  item: TreeItem;
  nodes: TodoNode[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpenDetails: (id: string) => void;
};

export function TreeNodeRow({ item, nodes, draggingId, onDragStart, onDragEnd, onOpenDetails }: TreeNodeRowProps) {
  const { node, depth, hasChildren } = item;
  const {
    activeNodeId,
    addNode,
    cycleStatus,
    deleteNode,
    toggleCollapse,
    moveAsChild,
    addDependency,
    setActive,
  } = useTodoStore();
  const dependencyState = getDependencyState(node, nodes);
  const isActive = activeNodeId === node.id;
  const isDone = node.status === "done";
  const isDragging = draggingId === node.id;
  const canAcceptDrop = Boolean(draggingId && draggingId !== node.id);

  return (
    <div
      className="tree-row"
      data-active={isActive}
      data-done={isDone}
      data-dragging={isDragging}
      data-drop-target={canAcceptDrop}
      data-parent={hasChildren}
      data-node-id={node.id}
      style={{ "--depth": depth } as CSSProperties}
      role="treeitem"
      aria-expanded={hasChildren ? !node.collapsed : undefined}
      onFocus={() => setActive(node.id)}
      onClick={() => onOpenDetails(node.id)}
      onDragOver={(event) => {
        if (!canAcceptDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const dependencyTarget = (event.target as HTMLElement | null)?.closest("[data-dependency-drop='true']");
        const droppedId = event.dataTransfer.getData("text/plain") || draggingId;
        if (dependencyTarget && droppedId && droppedId !== node.id) {
          addDependency(node.id, droppedId);
        } else if (droppedId && droppedId !== node.id) {
          moveAsChild(droppedId, node.id);
        }
        onDragEnd();
      }}
    >
      <button
        className="drag-handle"
        aria-label={`Drag ${node.title}`}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          onDragStart(node.id);
        }}
        onDragEnd={onDragEnd}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical size={15} />
      </button>
      <button
        className="disclosure"
        aria-label={node.collapsed ? "Expand children" : "Collapse children"}
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) toggleCollapse(node.id);
        }}
        disabled={!hasChildren}
      >
        {hasChildren ? node.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} /> : null}
      </button>

      <TaskListItem
        node={node}
        blockedByDependency={dependencyState.isBlockedByDependency}
        draggingId={draggingId}
        onCycleStatus={() => cycleStatus(node.id)}
        onAddDependencyDrop={(dependencyId) => {
          addDependency(node.id, dependencyId);
          onDragEnd();
        }}
      />

      <DependencyWarning node={node} nodes={nodes} />

      <div className="row-actions">
        <button
          aria-label="Edit task"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetails(node.id);
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          aria-label="Add child"
          onClick={(event) => {
            event.stopPropagation();
            addNode("New task", node.id);
          }}
        >
          <Plus size={16} />
        </button>
        <details className="row-menu" onClick={(event) => event.stopPropagation()}>
          <summary aria-label="Task actions">
            <MoreVertical size={16} />
          </summary>
          <div className="row-menu-popover">
            <button
              className="row-menu-button row-menu-edit-button"
              onClick={() => {
                onOpenDetails(node.id);
              }}
            >
              <Pencil size={15} />
              Edit
            </button>
            <button
              className="row-menu-button row-menu-add-button"
              onClick={() => {
                addNode("New task", node.id);
              }}
            >
              <Plus size={15} />
              Add child
            </button>
            <button
              className="row-menu-button row-delete-button"
              onClick={() => {
                deleteNode(node.id);
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
