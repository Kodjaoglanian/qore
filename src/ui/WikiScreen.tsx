import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { StyledBox } from "./components/Box.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { ScrollIndicator } from "./components/ScrollIndicator.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { WikiContent, parsePageIndex, parseMarkdown, blockHeight, extractPageTitle, type WikiBlock } from "./WikiRenderer.js";

const WIKI_BASE = "https://raw.githubusercontent.com/wiki/Kodjaoglanian/qore/";

interface WikiPage {
  name: string;
  slug: string;
  category: string;
}

interface WikiScreenProps {
  onBack: () => void;
}

async function fetchPage(slug: string): Promise<string> {
  const resp = await fetch(`${WIKI_BASE}${encodeURIComponent(slug)}.md`, {
    headers: { "User-Agent": "qore-wiki" },
  });
  if (!resp.ok) throw new Error(`Page not found (${resp.status})`);
  return resp.text();
}

export function WikiScreen({ onBack }: WikiScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));

  const [pages, setPages] = useState<WikiPage[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sidebarIdx, setSidebarIdx] = useState(0);
  const [rawContent, setRawContent] = useState("");
  const [pageTitle, setPageTitle] = useState("Wiki");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockOffset, setBlockOffset] = useState(0);
  const [sidebarFocus, setSidebarFocus] = useState(false);

  const sidebarWidth = Math.min(30, Math.max(18, Math.floor(termWidth * 0.28)));
  const contentWidth = Math.max(30, termWidth - sidebarWidth - margin * 2 - 4);
  const availH = Math.max(8, termHeight - 4 - 5);
  const contentInnerH = availH - 4;

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBlockOffset(0);
    try {
      const homeMd = await fetchPage("Home");
      const pageList = parsePageIndex(homeMd);
      setPages(pageList);
      if (pageList.length > 0) {
        const md = await fetchPage(pageList[0].slug);
        setRawContent(md);
        setPageTitle(extractPageTitle(md));
        setCurrentIdx(0);
        setSidebarIdx(0);
      } else {
        setRawContent("# Wiki\n\nNo pages found.");
        setPageTitle("Wiki");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    setBlockOffset(0);
    try {
      const md = await fetchPage(slug);
      setRawContent(md);
      setPageTitle(extractPageTitle(md));
      const idx = pages.findIndex((p) => p.slug === slug);
      if (idx >= 0) {
        setCurrentIdx(idx);
        setSidebarIdx(idx);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pages]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const totalPages = pages.length;

  const prevPage = useCallback(() => {
    if (currentIdx > 0) loadPage(pages[currentIdx - 1].slug);
  }, [currentIdx, pages, loadPage]);

  const nextPage = useCallback(() => {
    if (currentIdx < pages.length - 1) loadPage(pages[currentIdx + 1].slug);
  }, [currentIdx, pages, loadPage]);

  const blocks = useMemo<WikiBlock[]>(() => {
    if (!rawContent) return [];
    return parseMarkdown(rawContent);
  }, [rawContent]);

  const { visibleBlocks, maxOffset, totalHeight } = useMemo(() => {
    const total = blocks.reduce((sum, b) => sum + blockHeight(b, contentWidth), 0);

    let maxOff = 0;
    for (let start = 0; start < blocks.length; start++) {
      let used = 0;
      let count = 0;
      for (let i = start; i < blocks.length; i++) {
        const h = blockHeight(blocks[i], contentWidth);
        if (used + h > contentInnerH && count > 0) break;
        used += h;
        count++;
      }
      if (count > 0) maxOff = start;
    }

    const offset = Math.min(blockOffset, maxOff);
    const visible: WikiBlock[] = [];
    let used = 0;
    for (let i = offset; i < blocks.length; i++) {
      const h = blockHeight(blocks[i], contentWidth);
      if (used + h > contentInnerH && visible.length > 0) break;
      visible.push(blocks[i]);
      used += h;
    }

    return { visibleBlocks: visible, maxOffset: maxOff, totalHeight: total };
  }, [blocks, blockOffset, contentInnerH, contentWidth]);

  useInput((input, key) => {
    if (input === "r" && error) {
      loadHome();
      return;
    }
    if (key.escape || input === "q") {
      if (sidebarFocus) {
        setSidebarFocus(false);
      } else {
        onBack();
      }
      return;
    }
    if (key.tab) {
      setSidebarFocus((s) => !s);
      return;
    }
    if (sidebarFocus) {
      if (key.upArrow) setSidebarIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setSidebarIdx((i) => Math.min(pages.length - 1, i + 1));
      if (key.return && pages[sidebarIdx]) loadPage(pages[sidebarIdx].slug);
      return;
    }
    if (key.upArrow || key.pageUp) {
      const amount = key.pageUp ? Math.max(1, Math.floor(contentInnerH / 8)) : 1;
      setBlockOffset((o) => Math.max(0, o - amount));
      return;
    }
    if (key.downArrow || key.pageDown) {
      const amount = key.pageDown ? Math.max(1, Math.floor(contentInnerH / 8)) : 1;
      setBlockOffset((o) => Math.min(maxOffset, o + amount));
      return;
    }
    if (key.leftArrow && currentIdx > 0) prevPage();
    if (key.rightArrow && currentIdx < pages.length - 1) nextPage();
  });

  const sidebarMax = Math.max(1, availH - 4);

  const sidebarVisible = useMemo(() => {
    interface SidebarItem {
      text: string;
      type: "category" | "page";
      pageIdx?: number;
    }
    const items: SidebarItem[] = [];
    const groups: Array<{ category: string; pages: WikiPage[] }> = [];
    for (const p of pages) {
      const existing = groups.find((g) => g.category === p.category);
      if (existing) existing.pages.push(p);
      else groups.push({ category: p.category, pages: [p] });
    }

    for (const g of groups) {
      items.push({ text: `  ${g.category}`, type: "category" });
      for (let pi = 0; pi < g.pages.length; pi++) {
        const pageIdx = pages.indexOf(g.pages[pi]);
        const p = g.pages[pi];
        const marker = pageIdx === currentIdx ? "→" : " ";
        items.push({ text: ` ${marker} ${p.name}`, type: "page", pageIdx });
      }
    }

    const maxScroll = Math.max(0, items.length - sidebarMax);
    let scrollOffset = sidebarIdx;
    for (let i = 0; i < items.length; i++) {
      if (items[i].pageIdx === sidebarIdx) {
        scrollOffset = i;
        break;
      }
    }
    const offset = Math.min(Math.max(0, scrollOffset - 2), maxScroll);
    const visible = items.slice(offset, offset + sidebarMax);

    return { items: visible, offset, total: items.length };
  }, [pages, currentIdx, sidebarIdx, sidebarMax]);

  const canScroll = blocks.length > visibleBlocks.length;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1}>
        <Breadcrumb items={["Home", "Wiki", pageTitle]} />
      </Box>

      <Box flexDirection="row" height={availH} overflow="hidden">
        <Box width={sidebarWidth} flexShrink={0} marginRight={1}>
          <StyledBox title="Pages" focused={sidebarFocus} borderColor={sidebarFocus ? colors.purple : colors.borderMuted} padding={1} height={availH} overflow="hidden">
            <Box flexDirection="column" overflow="hidden">
              {sidebarVisible.items.map((item, i) => {
                const isSelected = sidebarFocus && item.type === "page" && item.pageIdx === sidebarIdx;
                const color = item.type === "category" ? colors.textDim
                  : item.text.includes("→") ? colors.purpleBright
                  : isSelected ? colors.purple
                  : colors.textMuted;
                const bold = item.type === "category" || item.text.includes("→");
                return (
                  <Text key={i} color={color} bold={bold}>
                    {item.text}
                  </Text>
                );
              })}
              {sidebarVisible.total > sidebarMax && (
                <ScrollIndicator offset={sidebarVisible.offset} total={sidebarVisible.total} visible={sidebarMax} />
              )}
            </Box>
          </StyledBox>
        </Box>

        <Box flexGrow={1}>
          <StyledBox title={loading ? "Loading..." : error ? "Error" : pageTitle} focused={!sidebarFocus} padding={1} height={availH} overflow="hidden">
            {loading && (
              <Text color={colors.textMuted}>Fetching page...</Text>
            )}
            {error && (
              <Box flexDirection="column">
                <Text color={colors.red}>[!] {error}</Text>
                <Box marginTop={1}>
                  <Text color={colors.textMuted}>  Press </Text>
                  <Text color={colors.purple} bold>r</Text>
                  <Text color={colors.textMuted}> to retry</Text>
                </Box>
              </Box>
            )}
            {!loading && !error && blocks.length > 0 && (
              <Box flexDirection="column" overflow="hidden">
                <WikiContent blocks={visibleBlocks} contentWidth={contentWidth - 2} />
                {canScroll && (
                  <Box marginTop={0}>
                    <ScrollIndicator offset={Math.min(blockOffset, maxOffset)} total={blocks.length} visible={visibleBlocks.length} />
                  </Box>
                )}
              </Box>
            )}
            {!loading && !error && blocks.length === 0 && (
              <Text color={colors.textMuted}>  No content</Text>
            )}
          </StyledBox>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Text color={colors.textMuted}>Press </Text>
          <Text color={colors.purple} bold>esc</Text>
          <Text color={colors.textMuted}> to go back</Text>
        </Box>
        <Box>
          <Text color={colors.textMuted}>
            {sidebarFocus ? "↑↓ select · Enter open" : "↑↓ scroll · ← prev · → next"}
            {"  "}
          </Text>
          <Text color={colors.purple} bold>Tab</Text>
          <Text color={colors.textMuted}> focus {sidebarFocus ? "content" : "sidebar"}</Text>
          {totalPages > 0 && (
            <Text color={colors.textMuted}>
              {"  ·  "}{currentIdx + 1}/{totalPages}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
