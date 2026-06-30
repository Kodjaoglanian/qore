import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import type { StorageProvider, BucketInfo, FileInfo } from "../core/types.js";

interface StorageScreenProps {
  provider: StorageProvider;
  onCommand: (cmd: string) => void;
}

export function StorageScreen({ provider, onCommand }: StorageScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(1, Math.floor(termWidth * 0.05));

  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    provider
      .listBuckets()
      .then((b) => {
        setBuckets(b);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [provider]);

  useEffect(() => {
    if (selectedBucket) {
      provider
        .listFiles(selectedBucket)
        .then(setFiles)
        .catch((e) => setError(String(e)));
    }
  }, [selectedBucket, provider]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} overflow="hidden" paddingX={margin}>
      <Box marginBottom={1} height={1}>
        <Text color={colors.purple} bold>
          {"│ Storage"}
        </Text>
        <Text color={colors.textDim}> {" · "}</Text>
        <Text color={provider.type === "local" ? colors.cyan : colors.blue} bold>
          {provider.type === "local" ? "Local Emulated" : "AWS Cloud"}
        </Text>
      </Box>

      <StyledBox title="Buckets" focused={!selectedBucket} padding={1} marginBottom={1}>
        {loading ? (
          <Text color={colors.yellow}>Loading buckets...</Text>
        ) : error ? (
          <Text color={colors.red}>Error: {error}</Text>
        ) : buckets.length === 0 ? (
          <Text color={colors.textMuted}>
            No buckets found. Use "create &lt;name&gt;" to create one.
          </Text>
        ) : (
          <Box flexDirection="column">
            {buckets.map((b) => (
              <Box
                key={b.name}
                justifyContent="space-between"
              >
                <Box>
                  <Text color={selectedBucket === b.name ? colors.purple : colors.textDim}>
                    {selectedBucket === b.name ? "> " : "  "}
                  </Text>
                  <Text color={colors.text} bold={selectedBucket === b.name}>
                    {b.name}
                  </Text>
                </Box>
                <Text color={colors.textMuted}>
                  {b.fileCount} files · {formatSize(b.sizeBytes)}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </StyledBox>

      {selectedBucket && (
        <StyledBox title={`Files in ${selectedBucket}`} focused padding={1} marginBottom={1}>
          {files.length === 0 ? (
            <Text color={colors.textMuted}>Bucket is empty.</Text>
          ) : (
            <Box flexDirection="column">
              {files.map((f, i) => (
                <Box key={i} justifyContent="space-between">
                  <Text color={colors.text}>  {f.key}</Text>
                  <Text color={colors.textMuted}>
                    {formatSize(f.sizeBytes)} · {f.lastModified}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </StyledBox>
      )}

      <Box marginTop={1}>
        <InputBar
          onSubmit={onCommand}
          placeholder="create <name> · delete <name> · back · quit"
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutBar
          shortcuts={[
            { key: "Enter", label: "execute" },
            { key: "esc", label: "back" },
            { key: "^c", label: "quit" },
          ]}
        />
      </Box>
    </Box>
  );
}
