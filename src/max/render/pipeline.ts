export interface RenderedBlock {
  type: "text" | "code" | "heading" | "list" | "quote";
  content: string;
  language?: string;
}

export function normalizeMarkdown(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseBlocks(text: string): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  const lines = text.split("\n");
  let currentBlock: RenderedBlock | null = null;

  for (const line of lines) {
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (currentBlock?.type === "code") {
        blocks.push(currentBlock);
        currentBlock = null;
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "code",
          content: "",
          language: codeBlockMatch[1] || undefined,
        };
      }
      continue;
    }

    if (currentBlock?.type === "code") {
      currentBlock.content += (currentBlock.content ? "\n" : "") + line;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        type: "heading",
        content: headingMatch[2],
      };
      blocks.push(currentBlock);
      currentBlock = null;
      continue;
    }

    if (line.startsWith("> ")) {
      if (currentBlock?.type === "quote") {
        currentBlock.content += "\n" + line.slice(2);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "quote",
          content: line.slice(2),
        };
      }
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      if (currentBlock?.type === "list") {
        currentBlock.content += "\n" + line;
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "list",
          content: line,
        };
      }
      continue;
    }

    if (currentBlock && currentBlock.type !== "text") {
      blocks.push(currentBlock);
      currentBlock = null;
    }

    if (!currentBlock) {
      currentBlock = { type: "text", content: line };
    } else {
      currentBlock.content += "\n" + line;
    }
  }

  if (currentBlock) blocks.push(currentBlock);

  return blocks;
}

export function renderToMaxMarkdown(blocks: RenderedBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(`**${block.content}**`);
        break;
      case "code":
        parts.push(["```" + (block.language ?? ""), block.content, "```"].join("\n"));
        break;
      case "quote":
        parts.push(
          block.content
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
        );
        break;
      case "list":
        parts.push(block.content);
        break;
      case "text":
      default:
        parts.push(block.content);
        break;
    }
  }

  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

export function chunkText(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitPoint = remaining.lastIndexOf("\n\n", maxLength);
    if (splitPoint <= 0) {
      splitPoint = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitPoint <= 0) {
      splitPoint = remaining.lastIndexOf(". ", maxLength);
    }
    if (splitPoint <= 0) {
      splitPoint = maxLength;
    } else {
      splitPoint += 1;
    }

    chunks.push(remaining.slice(0, splitPoint));
    remaining = remaining.slice(splitPoint);
  }

  return chunks;
}

export function renderText(text: string): string {
  const normalized = normalizeMarkdown(text);
  const blocks = parseBlocks(normalized);
  return renderToMaxMarkdown(blocks);
}
