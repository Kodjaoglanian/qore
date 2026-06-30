import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface BreadcrumbProps {
  items: string[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <Box flexDirection="row">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Box key={i}>
            {i > 0 && <Text color={colors.purpleDim}>{" › "}</Text>}
            <Text color={isLast ? colors.textBright : colors.textDim} bold={isLast}>
              {item}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
