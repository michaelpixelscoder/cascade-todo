import type { MouseEvent, ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
  role?: "dialog" | "presentation";
  ariaLabel?: string;
  closeOnOverlayClick?: boolean;
};

export function Modal({
  open,
  onClose,
  children,
  overlayClassName,
  contentClassName,
  role = "dialog",
  ariaLabel,
  closeOnOverlayClick = true,
}: ModalProps) {
  if (!open) return null;

  function onOverlayMouseDown() {
    if (closeOnOverlayClick) onClose();
  }

  function onContentMouseDown(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className={overlayClassName ?? "app-modal-overlay"} onMouseDown={onOverlayMouseDown}>
      <section
        className={contentClassName ?? "app-modal-content"}
        role={role}
        aria-modal={role === "dialog" ? true : undefined}
        aria-label={ariaLabel}
        onMouseDown={onContentMouseDown}
      >
        {children}
      </section>
    </div>
  );
}
