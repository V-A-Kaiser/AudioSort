import { afterEach, describe, expect, it, vi } from "vitest";
import { droppable } from "./droppable";

const drag = (type: string, init: DragEventInit = {}) =>
  new DragEvent(type, { bubbles: true, cancelable: true, ...init });

describe("droppable", () => {
  const node = document.createElement("div");
  const child = document.createElement("span");
  node.append(child);
  document.body.append(node);

  afterEach(() => node.removeAttribute("data-dragging"));

  it("marks the node while a drag hovers it", () => {
    const action = droppable(node, () => {});

    node.dispatchEvent(drag("dragenter"));
    expect(node.hasAttribute("data-dragging")).toBe(true);

    action.destroy();
  });

  it("stays marked when the drag moves onto a descendant", () => {
    const action = droppable(node, () => {});

    node.dispatchEvent(drag("dragover"));
    node.dispatchEvent(drag("dragleave", { relatedTarget: child }));
    expect(node.hasAttribute("data-dragging")).toBe(true);

    node.dispatchEvent(drag("dragleave", { relatedTarget: document.body }));
    expect(node.hasAttribute("data-dragging")).toBe(false);

    action.destroy();
  });

  it("hands over the dropped file and clears the mark", () => {
    const onfile = vi.fn();
    const action = droppable(node, onfile);
    const file = new File(["x"], "a.wav");
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    node.dispatchEvent(drag("dragenter"));
    node.dispatchEvent(drag("drop", { dataTransfer }));

    expect(onfile).toHaveBeenCalledWith(file);
    expect(node.hasAttribute("data-dragging")).toBe(false);

    action.destroy();
  });

  it("reports null when the drop carries no file", () => {
    const onfile = vi.fn();
    const action = droppable(node, onfile);

    node.dispatchEvent(drag("drop", { dataTransfer: new DataTransfer() }));
    expect(onfile).toHaveBeenCalledWith(null);

    action.destroy();
  });

  it("stops listening once destroyed", () => {
    const onfile = vi.fn();
    droppable(node, onfile).destroy();

    node.dispatchEvent(drag("dragenter"));
    node.dispatchEvent(drag("drop", { dataTransfer: new DataTransfer() }));

    expect(onfile).not.toHaveBeenCalled();
    expect(node.hasAttribute("data-dragging")).toBe(false);
  });
});
