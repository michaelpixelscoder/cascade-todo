import type { TodoNode } from "../../domain/nodes";
import { StatusIcon } from "../tree/StatusIcon";

type TaskListItemProps = {
  node: TodoNode;
  blockedByDependency?: boolean;
  readOnly?: boolean;
  draggingId?: string | null;
  onCycleStatus?: () => void;
  onAddDependencyDrop?: (dependencyId: string) => void;
};

export function TaskListItem({
  node,
  blockedByDependency = false,
  readOnly = false,
  draggingId,
  onCycleStatus,
  onAddDependencyDrop,
}: TaskListItemProps) {
  const isDone = node.status === "done";
  const showDependencyTarget = node.dependsOnIds.length > 0 || Boolean(draggingId && draggingId !== node.id);

  return (
    <>
      <StatusIcon
        status={node.status}
        blockedByDependency={blockedByDependency}
        readOnly={readOnly}
        onClick={onCycleStatus ?? (() => undefined)}
      />
      <div className="node-content">
        <div className="title-line">
          <span className="task-title" data-done={isDone}>
            {node.title}
          </span>
          {showDependencyTarget && (
            <button
              className="dependency-pill"
              data-dependency-drop="true"
              data-drag-active={Boolean(draggingId && draggingId !== node.id)}
              disabled={readOnly}
              aria-label={node.dependsOnIds.length ? `${node.dependsOnIds.length} dependencies` : "Add as dependency"}
              onDragOver={(event) => {
                if (readOnly || !draggingId || draggingId === node.id) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "link";
              }}
              onDragEnter={(event) => {
                if (readOnly || !draggingId || draggingId === node.id) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (readOnly) return;
                const dependencyId = event.dataTransfer.getData("text/plain") || draggingId;
                if (dependencyId && dependencyId !== node.id) {
                  onAddDependencyDrop?.(dependencyId);
                }
              }}
            >
              {node.dependsOnIds.length ? `(${node.dependsOnIds.length})` : "(add as dependency)"}
            </button>
          )}
        </div>
        {node.note ? <p className="task-description">{node.note}</p> : null}
      </div>
    </>
  );
}
