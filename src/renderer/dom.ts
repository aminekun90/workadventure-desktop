type ElementType<T extends Element> = abstract new () => T;

/** Missing markup is a programming error: fail loudly instead of returning null. */
export function byId<T extends Element>(id: string, type: ElementType<T>): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Launcher markup is missing #${id} (${type.name})`);
  return element;
}

export function query<T extends Element>(root: ParentNode, selector: string, type: ElementType<T>): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Launcher markup is missing ${selector} (${type.name})`);
  return element;
}
