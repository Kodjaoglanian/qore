import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import pkg from "../../../package.json" with { type: "json" };

interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  if (compact) {
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={colors.purpleBright} bold>◈ QORE</Text>
        <Text color={colors.purpleDim}>v{pkg.version}</Text>
        <Text color={colors.textMuted}>·</Text>
        <Text color={colors.textDim} italic>Hybrid Infrastructure Control Center</Text>
      </Box>
    );
  }

  const lines = [
    "                  ,----..                         ",
    "    ,----..      /   /   \\  ,-.----.       ,---,. ",
    "   /   /   \\    /   .     : \\    /  \\    ,'  .' | ",
    "  /   .     :  .   /   ;.  \\;   :    \\ ,---.'   | ",
    " .   /   ;.  \\.   ;   /  ` ;|   | .\\ : |   |   .' ",
    ".   ;   /  ` ;;   |  ; \\ ; |.   : |: | :   :  |-, ",
    ";   |  ; \\ ; ||   :  | ; | '|   |  \\ : :   |  ;/| ",
    "|   :  | ; | '.   |  ' ' ' :|   : .  / |   :   .' ",
    ".   |  ' ' ' :'   ;  \\; /  |;   | |  \\ |   |  |-, ",
    "'   ;  \\; /  | \\   \\  ',  / |   | ;\\  \\'   :  ;/| ",
    " \\   \\  ',  . \\ ;   :    /  :   ' | \\.'|   |    \\ ",
    "  ;   :      ; | \\   \\ .'   :   : :-'  |   :   .' ",
    "   \\   \\ .'`--\"   `---`     |   |.'    |   | ,'   ",
    "    `---`                   `---'      `----'     ",
  ];

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, i) => {
        const lineColor =
          i <= 3
            ? colors.purpleBright
            : i <= 9
              ? colors.purple
              : colors.purpleDim;
        return (
          <Box key={i}>
            <Text color={lineColor} bold>
              {line}
            </Text>
          </Box>
        );
      })}
      <Box marginTop={1} gap={1}>
        <Text color={colors.purpleBright} bold>◈</Text>
        <Text color={colors.textDim} italic>
          Terminal-native hybrid infrastructure orchestrator
        </Text>
        <Text color={colors.purpleDim}>·</Text>
        <Text color={colors.purple} bold>v{pkg.version}</Text>
      </Box>
    </Box>
  );
}
