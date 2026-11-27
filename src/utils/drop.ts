/**
 * Files dragged in from the visitor's own computer: kitty fetches them with
 * `curl`, and jīzǐ adds them to the folder it lists (`fileStore.addFile`).
 */

/** Whether a drag carries files, rather than text or a link. */
export function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/** The dropped files' names and bytes. */
export function readDropped(files: FileList): Promise<{ name: string; bytes: Uint8Array }[]> {
  return Promise.all([...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
}

/**
 * A file dropped anywhere else would be opened by the browser in place of
 * the site, throwing the desktop away, so a drop of files that nothing took
 * is refused. One a window took is left alone: this runs after React's own
 * handlers, and its `none` would overwrite their `copy`, and a drag whose
 * last effect is `none` is never dropped.
 */
export function guardFileDrops(): void {
  const refuse = (event: DragEvent) => {
    if (!carriesFiles(event) || event.defaultPrevented) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
  };
  window.addEventListener("dragover", refuse);
  window.addEventListener("drop", refuse);
}
