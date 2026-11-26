import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { Spinner } from "./components/Spinner.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import type { StorageProvider, BucketInfo, FileInfo } from "../core/types.js";

interface StorageScreenProps {
  provider: StorageProvider;
  onCommand: (cmd: string) => void;
  focused?: boolean;
}

const STORAGE_COMPLETIONS = ["create ", "delete ", "open ", "upload ", "rm ", "close", "refresh", "providers", "back", "quit"];

export function StorageScreen({ provider, onCommand, focused = true }: StorageScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.03));

  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [selectedBucketIdx, setSelectedBucketIdx] = useState(0);
  const [openBucket, setOpenBucket] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);

  const loadBuckets = useCallback(async () => {
    setLoading(true);
    try {
      const b = await provider.listBuckets();
      setBuckets(b);
      if (openBucket && !b.some((x) => x.name === openBucket)) {
        setOpenBucket(null);
        setFiles([]);
      }
    } catch (e) {
      setStatus(`[!] ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [provider, openBucket]);

  const loadFiles = useCallback(async (bucketName: string) => {
    try {
      const f = await provider.listFiles(bucketName);
      setFiles(f);
      setSelectedFileIdx(0);
    } catch (e) {
      setStatus(`[!] ${String(e)}`);
    }
  }, [provider]);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    if (openBucket) loadFiles(openBucket);
  }, [openBucket, loadFiles]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (openBucket) {
          setOpenBucket(null);
          setFiles([]);
        } else {
          onCommand("back");
        }
        return;
      }
      if (openBucket) {
        if (key.upArrow) setSelectedFileIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelectedFileIdx((i) => Math.min(Math.max(0, files.length - 1), i + 1));
      } else {
        if (key.upArrow) setSelectedBucketIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelectedBucketIdx((i) => Math.min(Math.max(0, buckets.length - 1), i + 1));
      }
    },
    { isActive: focused }
  );

  const handleEmptySubmit = useCallback(() => {
    if (!openBucket && buckets[selectedBucketIdx]) {
      setOpenBucket(buckets[selectedBucketIdx].name);
    }
  }, [openBucket, buckets, selectedBucketIdx]);

  const handleSubmit = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setCmdHistory((prev) => [...prev.slice(-49), trimmed]);
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === "create" && parts[1]) {
      try {
        await provider.createBucket(parts[1]);
        setStatus(`[ok] Bucket "${parts[1]}" created`);
        await loadBuckets();
      } catch (e) {
        setStatus(`[!] ${(e as Error).message}`);
      }
      return;
    }

    if (cmd === "delete") {
      const target = parts[1] ?? buckets[selectedBucketIdx]?.name;
      if (!target) {
        setStatus("[!] Usage: delete <bucket>");
        return;
      }
      try {
        await provider.deleteBucket(target);
        setStatus(`[ok] Bucket "${target}" deleted`);
        if (openBucket === target) {
          setOpenBucket(null);
          setFiles([]);
        }
        await loadBuckets();
      } catch (e) {
        setStatus(`[!] ${(e as Error).message}`);
      }
      return;
    }

    if (cmd === "open") {
      const target = parts[1] ?? buckets[selectedBucketIdx]?.name;
      if (target) setOpenBucket(target);
      return;
    }

    if (cmd === "close") {
      setOpenBucket(null);
      setFiles([]);
      return;
    }

    if (cmd === "upload") {
      if (!openBucket) {
        setStatus("[!] Open a bucket first (Enter or open <bucket>)");
        return;
      }
      const localPath = parts[1];
      if (!localPath || !existsSync(localPath)) {
        setStatus("[!] File not found. Usage: upload <localPath> [key]");
        return;
      }
      const key = parts[2] ?? basename(localPath);
      try {
        const data = readFileSync(localPath);
        await provider.uploadFile(openBucket, key, data);
        setStatus(`[ok] Uploaded "${key}" to ${openBucket}`);
        await loadFiles(openBucket);
        await loadBuckets();
      } catch (e) {
        setStatus(`[!] ${(e as Error).message}`);
      }
      return;
    }

    if (cmd === "rm") {
      if (!openBucket) {
        setStatus("[!] Open a bucket first to delete files");
        return;
      }
      const key = parts[1] ?? files[selectedFileIdx]?.key;
      if (!key) {
        setStatus("[!] Usage: rm <key>");
        return;
      }
      try {
        await provider.deleteFile(openBucket, key);
        setStatus(`[ok] Deleted "${key}"`);
        await loadFiles(openBucket);
        await loadBuckets();
      } catch (e) {
        setStatus(`[!] ${(e as Error).message}`);
      }
      return;
    }

    if (cmd === "refresh") {
      await loadBuckets();
      if (openBucket) await loadFiles(openBucket);
      setStatus("[ok] Refreshed");
      return;
    }

    onCommand(trimmed);
  }, [provider, buckets, selectedBucketIdx, openBucket, files, selectedFileIdx, loadBuckets, loadFiles, onCommand]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1} justifyContent="space-between">
        <Breadcrumb items={openBucket ? ["Home", "Storage", openBucket] : ["Home", "Storage"]} />
        <Text color={provider.type === "local" ? colors.cyan : colors.blue} bold>
          {provider.type === "local" ? "● Local Emulated S3 (SQLite)" : "● AWS S3 Cloud"}
        </Text>
      </Box>

      <StyledBox
        title="Buckets"
        rightTitle={`${buckets.length} total`}
        focused={!openBucket}
        padding={1}
        marginBottom={1}
      >
        {loading ? (
          <Spinner label="Loading buckets..." color={colors.yellow} />
        ) : buckets.length === 0 ? (
          <Text color={colors.textMuted}>
            No buckets found. Type "create &lt;name&gt;" to create a local S3 bucket.
          </Text>
        ) : (
          <Box flexDirection="column">
            {buckets.map((b, i) => {
              const isSelected = !openBucket && i === selectedBucketIdx;
              const isOpen = openBucket === b.name;
              return (
                <Box key={b.name} justifyContent="space-between">
                  <Box>
                    <Text color={isSelected || isOpen ? colors.purpleBright : colors.textDim} bold={isSelected || isOpen}>
                      {isOpen ? "▾ " : isSelected ? "▸ " : "  "}
                    </Text>
                    <Text color={isSelected || isOpen ? colors.textBright : colors.text} bold={isSelected || isOpen}>
                      ▤ {b.name}
                    </Text>
                  </Box>
                  <Text color={colors.textMuted}>
                    {b.fileCount} files · {formatSize(b.sizeBytes)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
      </StyledBox>

      {openBucket && (
        <StyledBox
          title={`Objects in ${openBucket}`}
          rightTitle={`${files.length} files`}
          focused
          padding={1}
          marginBottom={1}
        >
          {files.length === 0 ? (
            <Text color={colors.textMuted}>Bucket is empty. Use "upload &lt;localPath&gt; [key]" to add files.</Text>
          ) : (
            <Box flexDirection="column">
              {files.slice(0, 12).map((f, i) => {
                const isSelected = i === selectedFileIdx;
                return (
                  <Box key={f.key} justifyContent="space-between">
                    <Text color={isSelected ? colors.textBright : colors.text} bold={isSelected}>
                      {isSelected ? "▸ " : "  "}{f.key}
                    </Text>
                    <Text color={colors.textMuted}>
                      {formatSize(f.sizeBytes)} · {f.lastModified.slice(0, 19)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </StyledBox>
      )}

      {status && (
        <Box marginBottom={1}>
          <Text color={status.startsWith("[ok]") ? colors.green : status.startsWith("[!]") ? colors.red : colors.textDim}>
            {"  "}{status}
          </Text>
        </Box>
      )}

      <Box marginTop={0}>
        <InputBar
          onSubmit={handleSubmit}
          onEmptySubmit={handleEmptySubmit}
          completions={STORAGE_COMPLETIONS}
          history={cmdHistory}
          focused={focused}
          placeholder="create <name> · delete <name> · upload <path> [key] · rm <key> · refresh · back"
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "↑/↓", label: "select" },
            { key: "Enter", label: openBucket ? "run" : "open bucket" },
            { key: "^K", label: "palette" },
            { key: "esc", label: openBucket ? "close bucket" : "back" },
          ]}
        />
      </Box>
    </Box>
  );
}
