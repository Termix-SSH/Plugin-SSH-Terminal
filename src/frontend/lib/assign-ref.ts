import type { Ref } from "react";

/** Sets a ref the way React would, whether it is a callback or an object. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}
