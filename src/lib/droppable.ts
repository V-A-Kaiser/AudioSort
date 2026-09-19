export const droppable = (node: HTMLElement, onfile: (file: File | null) => void) => {
  const mark = (active: boolean) => node.toggleAttribute("data-dragging", active);

  const hover = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    mark(true);
  };

  const leave = (event: DragEvent) => {
    if (!node.contains(event.relatedTarget as Node | null)) mark(false);
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    mark(false);
    onfile(event.dataTransfer?.files[0] ?? null);
  };

  node.addEventListener("dragenter", hover);
  node.addEventListener("dragover", hover);
  node.addEventListener("dragleave", leave);
  node.addEventListener("drop", drop);

  return {
    destroy: () => {
      node.removeEventListener("dragenter", hover);
      node.removeEventListener("dragover", hover);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    }
  };
};
