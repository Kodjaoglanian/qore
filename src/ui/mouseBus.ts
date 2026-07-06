export interface MouseClickEvent {
  type: "click" | "rightClick";
  x: number;
  y: number;
}

type Handler = (event: MouseClickEvent) => void;
let currentHandler: Handler | null = null;

export function setMouseHandler(h: Handler | null): void {
  currentHandler = h;
}

export function dispatchMouse(event: MouseClickEvent): void {
  if (currentHandler) currentHandler(event);
}
