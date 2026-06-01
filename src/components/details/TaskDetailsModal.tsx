import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link2, MoreVertical, Plus, Trash2, X } from "lucide-react";
import type { TodoNode } from "../../domain/nodes";
import { getDependencyState } from "../../domain/cascade";
import { isDescendant } from "../../domain/tree";
import { useTodoStore } from "../../store/todo-store";
import { TaskListItem } from "../task/TaskListItem";
import { Modal } from "../ui/Modal";

type TaskDetailsModalProps = {
  node: TodoNode;
  nodes: TodoNode[];
  onSelectTask: (id: string) => void;
  onClose: () => void;
};

export function TaskDetailsModal({ node, nodes, onSelectTask, onClose }: TaskDetailsModalProps) {
  const updateTitle = useTodoStore((state) => state.updateTitle);
  const updateNote = useTodoStore((state) => state.updateNote);
  const addComment = useTodoStore((state) => state.addComment);
  const addDependencies = useTodoStore((state) => state.addDependencies);
  const removeDependency = useTodoStore((state) => state.removeDependency);
  const deleteNode = useTodoStore((state) => state.deleteNode);
  const [title, setTitle] = useState(node.title);
  const [note, setNote] = useState(node.note ?? "");
  const [comment, setComment] = useState("");
  const [dependencyPickerOpen, setDependencyPickerOpen] = useState(false);
  const [selectedDependencyIds, setSelectedDependencyIds] = useState<string[]>([]);
  const dependencyState = useMemo(() => getDependencyState(node, nodes), [node, nodes]);
  const dependents = useMemo(
    () => nodes.filter((candidate) => candidate.dependsOnIds.includes(node.id)),
    [node.id, nodes],
  );
  const dependencyOptions = useMemo(
    () =>
      nodes.filter(
        (candidate) =>
          candidate.id !== node.id &&
          !node.dependsOnIds.includes(candidate.id) &&
          !isDescendant(candidate.id, node.id, nodes),
      ),
    [node.dependsOnIds, node.id, nodes],
  );

  useEffect(() => {
    setTitle(node.title);
    setNote(node.note ?? "");
    setComment("");
    setDependencyPickerOpen(false);
    setSelectedDependencyIds([]);
  }, [node.id, node.note, node.title]);

  function commitFields() {
    updateTitle(node.id, title);
    updateNote(node.id, note);
  }

  function close() {
    commitFields();
    onClose();
  }

  function submitComment(event: FormEvent) {
    event.preventDefault();
    addComment(node.id, comment);
    setComment("");
  }

  function toggleDependencySelection(id: string) {
    setSelectedDependencyIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
  }

  function submitDependencies() {
    addDependencies(node.id, selectedDependencyIds);
    setSelectedDependencyIds([]);
    setDependencyPickerOpen(false);
  }

  return (
    <Modal open onClose={close} overlayClassName="modal-layer" contentClassName="task-modal" ariaLabel="Task details">
        <div className="modal-main">
          <div className="modal-header">
            <span>Task details</span>
            <div className="modal-header-actions">
              <details className="modal-actions-menu">
                <summary aria-label="Task detail actions">
                  <MoreVertical size={18} />
                </summary>
                <div className="modal-actions-popover">
                  <button
                    className="modal-delete-button"
                    onClick={() => {
                      deleteNode(node.id);
                      onClose();
                    }}
                  >
                    <Trash2 size={15} />
                    Delete task
                  </button>
                </div>
              </details>
              <button className="modal-icon-button" aria-label="Close details" onClick={close}>
                <X size={18} />
              </button>
            </div>
          </div>

          <label className="field-label">
            Title
            <textarea
              className="modal-title-input"
              value={title}
              rows={2}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitFields}
            />
          </label>

          <label className="field-label">
            Description
            <textarea
              className="modal-description-input"
              value={note}
              rows={6}
              placeholder="Add description"
              onChange={(event) => setNote(event.target.value)}
              onBlur={commitFields}
            />
          </label>

          <section className="comments-section">
            <h2>Comments</h2>
            <div className="comment-list">
              {(node.comments ?? []).length ? (
                node.comments?.map((item, index) => (
                  <p className="comment-item" key={`${node.id}-comment-${index}`}>
                    {item}
                  </p>
                ))
              ) : (
                <p className="empty-inline">No comments yet.</p>
              )}
            </div>
            <form className="comment-form" onSubmit={submitComment}>
              <textarea
                value={comment}
                rows={3}
                placeholder="Add a comment"
                onChange={(event) => setComment(event.target.value)}
              />
              <button type="submit">Add comment</button>
            </form>
          </section>
        </div>

        <aside className="modal-sidebar">
          <div className="sidebar-section-heading">
            <h2>Dependencies</h2>
            <button className="sidebar-add-button" onClick={() => setDependencyPickerOpen(true)}>
              <Plus size={15} />
              Add
            </button>
          </div>
          {dependencyState.dependencies.length ? (
            <div className="dependency-list">
              {dependencyState.dependencies.map((dependency) => (
                <div className="dependency-card" key={dependency.id}>
                  <Link2 size={15} />
                  <button
                    className="dependency-title"
                    onClick={() => {
                      commitFields();
                      onSelectTask(dependency.id);
                    }}
                  >
                    {dependency.title}
                  </button>
                  <button
                    className="dependency-remove"
                    aria-label={`Remove dependency ${dependency.title}`}
                    onClick={() => removeDependency(node.id, dependency.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-inline">Drop another task on this task's dependency indicator to add one.</p>
          )}

          <div className="sidebar-section-heading dependents-heading">
            <h2>Dependents</h2>
          </div>
          {dependents.length ? (
            <div className="dependency-list">
              {dependents.map((dependent) => (
                <div className="dependency-card" key={dependent.id}>
                  <Link2 size={15} />
                  <button
                    className="dependency-title"
                    onClick={() => {
                      commitFields();
                      onSelectTask(dependent.id);
                    }}
                  >
                    {dependent.title}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-inline">No tasks depend on this one.</p>
          )}
        </aside>


      {dependencyPickerOpen && (
        <Modal
          open
          onClose={() => setDependencyPickerOpen(false)}
          overlayClassName="modal-layer dependency-picker-layer"
          contentClassName="dependency-picker"
          ariaLabel="Add dependencies"
        >
          <div className="dependency-picker-header">
            <h2>Add dependencies</h2>
            <button
              className="modal-icon-button"
              aria-label="Close dependency picker"
              onClick={() => setDependencyPickerOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="dependency-picker-list">
            {dependencyOptions.length ? (
              dependencyOptions.map((option) => (
                <label className="dependency-option" key={option.id}>
                  <input
                    type="checkbox"
                    checked={selectedDependencyIds.includes(option.id)}
                    onChange={() => toggleDependencySelection(option.id)}
                  />
                  <TaskListItem node={option} readOnly />
                </label>
              ))
            ) : (
              <p className="empty-inline">No available tasks to add.</p>
            )}
          </div>
          <div className="dependency-picker-footer">
            <button onClick={() => setDependencyPickerOpen(false)}>Cancel</button>
            <button disabled={!selectedDependencyIds.length} onClick={submitDependencies}>
              Add selected
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
