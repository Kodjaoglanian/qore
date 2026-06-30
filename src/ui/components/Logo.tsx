import React from "react";
import { Box, Text, Newline } from "ink";
import { colors } from "../theme.js";

export function Logo() {
  const purple = colors.purple;
  const dim = colors.purpleDim;

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
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={i === 0 || i === 13 ? dim : purple} bold>
            {line}
          </Text>
        </Box>
      ))}
      <Newline />
      <Text color={colors.textMuted} italic>
        A terminal-native hybrid infrastructure orchestrator
      </Text>
    </Box>
  );
}
