/**
 * Release notes, as written on GitHub (Markdown), turned into a few plain blocks the About window renders with
 * textContent only: titles, paragraphs, lists and bold. Links keep their text: local pages never open a free URL.
 */
export interface Inline {
  text: string;
  bold: boolean;
}
export type NotesBlock = { kind: "title"; text: string } | { kind: "paragraph"; inline: Inline[] } | { kind: "list"; items: Inline[][] };

export function parseReleaseNotes(markdown: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
    if (items.length > 0) blocks.push({ kind: "list", items: items.map(parseInline) });
    paragraph = [];
    items = [];
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const title = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (line === "") {
      flush();
    } else if (title) {
      flush();
      blocks.push({ kind: "title", text: plain(title[1] ?? "") });
    } else if (item) {
      if (paragraph.length > 0) flush();
      items.push(item[1] ?? "");
    } else if (items.length > 0 && raw.startsWith(" ")) {
      // A continuation line of the previous list item.
      items[items.length - 1] += ` ${line}`;
    } else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** **bold** spans; [text](url) keeps its text; `code` loses its backticks. */
export function parseInline(text: string): Inline[] {
  return plainLinks(text)
    .split(/(\*\*[^*]+\*\*)/)
    .filter((part) => part !== "")
    .map((part) => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      return { text: (bold?.[1] ?? part).replace(/`/g, ""), bold: bold !== null };
    });
}

function plain(text: string): string {
  return parseInline(text)
    .map(({ text: part }) => part)
    .join("");
}

function plainLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}
