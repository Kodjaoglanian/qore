import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface BoxProps {
  children?: React.ReactNode;
  title?: string;
  rightTitle?: string;
  focused?: boolean;
  width?: number | string;
  height?: number;
  padding?: number;
  flexDirection?: "row" | "column";
  borderColor?: string;
  margin?: number;
  marginBottom?: number;
  marginTop?: number;
  marginRight?: number;
  overflow?: "hidden";
  variant?: "default" | "overlay";
}

export function StyledBox({
  children,
  title,
  rightTitle,
  focused = false,
  width = "100%",
  height,
  padding = 1,
  flexDirection = "column",
  borderColor,
  margin = 0,
  marginBottom,
  marginTop,
  marginRight,
  overflow,
  variant = "default",
}: BoxProps) {
  const border = borderColor ?? (focused ? colors.border : colors.borderMuted);
  const borderStyle = variant === "overlay" ? "double" : "round";
  const titleColor = focused ? colors.purpleBright : variant === "overlay" ? colors.purpleBright : colors.textDim;

  return (
    <Box
      flexDirection={flexDirection}
      width={width}
      height={height}
      padding={padding}
      margin={margin}
      marginBottom={marginBottom}
      marginTop={marginTop}
      marginRight={marginRight}
      borderStyle={borderStyle}
      borderColor={border}
      overflow={overflow}
    >
      {(title || rightTitle) && (
        <Box justifyContent="space-between" width="100%" height={1} flexShrink={0} overflow="hidden">
          {title ? (
            <Text color={titleColor} bold={focused || variant === "overlay"} wrap="truncate">
              {focused ? "▸ " : ""}{title}
            </Text>
          ) : (
            <Text> </Text>
          )}
          {rightTitle && (
            <Text color={colors.textMuted} wrap="truncate"> {rightTitle}</Text>
          )}
        </Box>
      )}
      {children}
    </Box>
  );
}
