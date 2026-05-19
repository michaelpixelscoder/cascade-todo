import { AlertTriangle, Check, Circle, Dot, Loader } from "lucide-react";
import type { NodeStatus } from "../../domain/nodes";

type StatusIconProps = {
  status: NodeStatus;
  blockedByDependency: boolean;
  readOnly?: boolean;
  onClick: () => void;
};

export function StatusIcon({ status, blockedByDependency, readOnly = false, onClick }: StatusIconProps) {
  const visual = blockedByDependency ? "dependency" : status;
  const label = blockedByDependency ? "Blocked by dependency" : `Status: ${status.replace("_", " ")}`;

  return (
    <button
      className="status-button"
      data-status={visual}
      aria-label={label}
      disabled={readOnly}
      onClick={(event) => {
        event.stopPropagation();
        if (readOnly) return;
        onClick();
      }}
    >
      {visual === "done" && <Check size={18} />}
      {visual === "in_progress" && <Loader size={16} />}
      {visual === "blocked" && <AlertTriangle size={16} />}
      {visual === "dependency" && <AlertTriangle size={16} />}
      {visual === "issue" && <Dot size={30} />}
      {visual === "todo" && <Circle size={15} />}
    </button>
  );
}
