import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { StyledBox } from "./components/Box.js";
import { colors } from "./theme.js";

interface WikiBlock {
  type: "heading" | "paragraph" | "code" | "table" | "list" | "hr";
  level?: number;
  text?: string;
  code?: string;
  lang?: string;
  rows?: string[][];
  items?: string[];
}

interface InlineSegment {
  text: string;
  bold?: boolean;
  code?: boolean;
  link?: string;
}

interface WikiContentProps {
  text: string;
  contentWidth: number;
}

function parseMarkdown(text: string): WikiBlock[] {
  const lines = text.split("\n");
  const blocks: WikiBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", code: codeLines.join("\n"), lang: lang || undefined });
      continue;
    }

    if (trimmed.startsWith("---")) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith("- ") || t.startsWith("* ")) {
          items.push(t.slice(2));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableRows: string[][] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith("|")) break;
        const cells = t.split("|").filter((c) => c.trim().length > 0).map((c) => c.trim());
        if (cells.length > 0) {
          const isSep = cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")));
          if (!isSep) tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: "table", rows: tableRows });
      }
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || t.startsWith("```") || t.startsWith("---") || t.startsWith("#") || t.startsWith("|") || t.startsWith("- ") || t.startsWith("* ")) break;
      paragraphLines.push(t);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }
  }

  return blocks;
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldStart = remaining.indexOf("**");
    const codeStart = remaining.indexOf("`");
    const linkStart = remaining.indexOf("[");

    if (boldStart === -1 && codeStart === -1 && linkStart === -1) {
      segments.push({ text: remaining });
      break;
    }

    const candidates: Array<{ index: number; handler: () => void }> = [];
    if (boldStart >= 0) candidates.push({ index: boldStart, handler: () => {
      const end = remaining.indexOf("**", boldStart + 2);
      if (end >= 0) {
        segments.push({ text: remaining.slice(0, boldStart) });
        segments.push({ text: remaining.slice(boldStart + 2, end), bold: true });
        remaining = remaining.slice(end + 2);
      } else {
        segments.push({ text: remaining });
        remaining = "";
      }
    }});
    if (codeStart >= 0) candidates.push({ index: codeStart, handler: () => {
      const end = remaining.indexOf("`", codeStart + 1);
      if (end >= 0) {
        segments.push({ text: remaining.slice(0, codeStart) });
        segments.push({ text: remaining.slice(codeStart + 1, end), code: true });
        remaining = remaining.slice(end + 1);
      } else {
        segments.push({ text: remaining });
        remaining = "";
      }
    }});
    if (linkStart >= 0) candidates.push({ index: linkStart, handler: () => {
      const closeBracket = remaining.indexOf("]", linkStart);
      const openParen = remaining.indexOf("(", closeBracket);
      const closeParen = remaining.indexOf(")", openParen);
      if (closeBracket >= 0 && openParen >= 0 && closeParen >= 0) {
        segments.push({ text: remaining.slice(0, linkStart) });
        segments.push({ text: remaining.slice(linkStart + 1, closeBracket), link: remaining.slice(openParen + 1, closeParen) });
        remaining = remaining.slice(closeParen + 1);
      } else {
        segments.push({ text: remaining });
        remaining = "";
      }
    }});

    candidates.sort((a, b) => a.index - b.index);
    candidates[0].handler();
  }

  return segments.filter((s) => s.text.length > 0);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function InlineText({ segments }: { segments: InlineSegment[] }) {
  return (
    <Text>
      {segments.map((s, i) => {
        if (s.code) return <Text key={i} color={colors.green}>{s.text}</Text>;
        if (s.bold) return <Text key={i} bold>{s.text}</Text>;
        if (s.link) return <Text key={i} color={colors.purple}>{s.text}</Text>;
        return <Text key={i}>{s.text}</Text>;
      })}
    </Text>
  );
}

function renderTable(rows: string[][], maxWidth: number): string[] {
  if (rows.length === 0) return [];
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = 10;
    for (const row of rows) {
      if (row[c]) max = Math.max(max, row[c].length + 2);
    }
    colWidths.push(Math.min(max, Math.floor(maxWidth / colCount)));
  }

  const result: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const cells = row.map((cell, c) => {
      const w = colWidths[c] || 10;
      const text = cell.length > w - 1 ? cell.slice(0, w - 2) + "…" : cell;
      return text.padEnd(w);
    });
    result.push(cells.join("│"));
    if (r === 0) {
      const sep = colWidths.map((w) => "─".repeat(w)).join("┼");
      result.push(sep);
    }
  }
  return result;
}

export function WikiContent({ text, contentWidth }: WikiContentProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const innerWidth = Math.max(30, contentWidth - 4);

  return (
    <Box flexDirection="column" width={contentWidth}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const displayText = stripHtml(block.text || "");
            const segs = parseInline(displayText);
            if (block.level === 1) {
              return (
                <Box key={i} marginBottom={1}>
                  <Text color={colors.purple} bold>{segs.length > 0 ? <InlineText segments={segs} /> : displayText}</Text>
                </Box>
              );
            }
            if (block.level === 2) {
              return (
                <Box key={i} marginBottom={1}>
                  <Text bold>{segs.length > 0 ? <InlineText segments={segs} /> : displayText}</Text>
                </Box>
              );
            }
            return (
              <Box key={i} marginBottom={1}>
                <Text color={colors.textDim} bold>{segs.length > 0 ? <InlineText segments={segs} /> : displayText}</Text>
              </Box>
            );
          }

          case "paragraph": {
            const displayText = stripHtml(block.text || "");
            const segs = parseInline(displayText);
            const isNav = displayText.startsWith("Previous:") || displayText.startsWith("Next:");
            if (isNav) {
              return (
                <Box key={i} marginBottom={1}>
                  <Text color={colors.textMuted}>{segs.length > 0 ? <InlineText segments={segs} /> : displayText}</Text>
                </Box>
              );
            }
            return (
              <Box key={i} marginBottom={1}>
                <Text>{segs.length > 0 ? <InlineText segments={segs} /> : displayText}</Text>
              </Box>
            );
          }

          case "list": {
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                {block.items?.map((item, j) => {
                  const segs = parseInline(stripHtml(item));
                  return (
                    <Box key={j}>
                      <Text color={colors.purpleDim}>  • </Text>
                      <Text><InlineText segments={segs} /></Text>
                    </Box>
                  );
                })}
              </Box>
            );
          }

          case "code": {
            const lineCount = block.code?.split("\n").length || 0;
            const codeHeight = Math.min(lineCount + 2, 30);
            return (
              <Box key={i} marginBottom={1}>
                <StyledBox title={block.lang || "code"} focused={false} padding={1} height={codeHeight} borderColor={colors.borderMuted}>
                  <Text color={colors.green}>{block.code}</Text>
                </StyledBox>
              </Box>
            );
          }

          case "table": {
            const lines = renderTable(block.rows || [], innerWidth);
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                {lines.map((line, j) => (
                  <Text key={j} color={j === 1 ? colors.borderMuted : colors.text}>{line}</Text>
                ))}
              </Box>
            );
          }

          case "hr": {
            return (
              <Box key={i} marginBottom={1}>
                <Text color={colors.borderMuted}>{"─".repeat(Math.min(innerWidth, 40))}</Text>
              </Box>
            );
          }
        }
      })}
    </Box>
  );
}

export function parsePageIndex(homeMarkdown: string): Array<{ name: string; slug: string; category: string }> {
  const pages: Array<{ name: string; slug: string; category: string }> = [];
  let currentCategory = "";

  const lines = homeMarkdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const catMatch = trimmed.match(/^###\s+(.+)/);
    if (catMatch) {
      currentCategory = catMatch[1];
      continue;
    }
    const linkMatch = trimmed.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const name = linkMatch[1];
      const slug = linkMatch[2].replace(/\.md$/, "");
      if (slug !== "Home") {
        pages.push({ name, slug, category: currentCategory });
      }
    }
  }
  return pages;
}

export function extractPageTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "Untitled";
}
