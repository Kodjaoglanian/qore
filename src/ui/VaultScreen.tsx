import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./theme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { StyledBox } from "./components/Box.js";
import { InputBar } from "./components/InputBar.js";
import { ShortcutBar } from "./components/ShortcutBar.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { Vault } from "../core/vault/vault.js";

interface VaultScreenProps {
  onUnlock: (vault: Vault) => void;
  onBack: () => void;
}

export function VaultScreen({ onUnlock, onBack }: VaultScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalSize();
  const margin = Math.max(2, Math.floor(termWidth * 0.08));
  const innerWidth = Math.max(40, termWidth - margin * 2 - 4);

  const initialized = Vault.isInitialized();
  const [mode, setMode] = useState<"init" | "confirm" | "unlock">(initialized ? "unlock" : "init");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) onBack();
  });

  const handleSubmit = useCallback((value: string) => {
    setError(null);

    if (mode === "init") {
      setPassword(value);
      setMode("confirm");
      return;
    }

    if (mode === "confirm") {
      if (value !== password) {
        setError("Passwords do not match.");
        setPassword("");
        setMode("init");
        return;
      }
      try {
        const vault = Vault.init(value);
        onUnlock(vault);
      } catch {
        setError("Failed to create vault.");
        setPassword("");
        setMode("init");
      }
      return;
    }

    if (mode === "unlock") {
      try {
        const vault = Vault.unlock(value);
        if (vault) {
          onUnlock(vault);
        } else {
          setError("Wrong password.");
        }
      } catch {
        setError("Failed to unlock vault.");
      }
      return;
    }
  }, [mode, password, onUnlock]);

  const title = mode === "unlock" ? "Unlock Vault" : "Create Vault";
  const placeholder = mode === "confirm" ? "Confirm password" : "Master password";
  const prompt = mode === "confirm" ? ">>" : ">";
  const stepLabel = mode === "init" ? "Step 1/2 — Set password" : mode === "confirm" ? "Step 2/2 — Confirm" : "Unlock";

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 4} paddingX={margin} justifyContent="center" overflow="hidden">
      <Box flexDirection="column" width={innerWidth}>
        <Box marginBottom={1} height={1}>
          <Breadcrumb items={["Home", title]} />
        </Box>

        <StyledBox title={title} focused padding={1}>
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color={colors.purple} bold>{"  "}{stepLabel}</Text>
            </Box>

            {mode === "init" && (
              <Text color={colors.textMuted}>
                {"  No vault found. Enter a master password to create one."}
              </Text>
            )}
            {mode === "confirm" && (
              <Text color={colors.green}>{"  [ok] Password set. Confirm it:"}</Text>
            )}
            {mode === "unlock" && (
              <Text color={colors.textMuted}>
                {"  Enter your master password to unlock."}
              </Text>
            )}

            {error && (
              <Box marginTop={1}>
                <Text color={colors.red} bold>{"  [!] "}{error}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <InputBar onSubmit={handleSubmit} placeholder={placeholder} prompt={prompt} />
            </Box>
          </Box>
        </StyledBox>

        <Box marginTop={1}>
          <Text color={colors.textDim}>
            {"  AES-256-GCM · scrypt · never stored in plaintext"}
          </Text>
        </Box>

        <Box marginTop={1}>
          <ShortcutBar
            shortcuts={[
              { key: "Enter", label: "confirm" },
              { key: "esc", label: "back" },
            ]}
          />
        </Box>
      </Box>
    </Box>
  );
}
