import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface BoxProps {
  children?: React.ReactNode;
  title?: string;
  focused?: boolean;
  width?: number | string;
  height?: number;
  padding?: number;
  flexDirection?: "row" | "column";
  borderColor?: string;
  margin?: number;
  marginBottom?: number;
  marginTop?: number;
  overflow?: "hidden";
  variant?: "default" | "overlay";
}

export function StyledBox({
  children,
  title,
  focused = false,
  width = "100%",
  height,
  padding = 1,
  flexDirection = "column",
  borderColor,
  margin = 0,
  marginBottom,
  marginTop,
  overflow,
  variant = "default",
}: BoxProps) {
  const border = borderColor ?? (focused ? colors.border : colors.borderMuted);
  const borderStyle = variant === "overlay" ? "double" : "round";
  const titleColor = focused ? colors.purple : variant === "overlay" ? colors.purpleBright : colors.textMuted;

  return (
    <Box
      flexDirection={flexDirection}
      width={width}
      height={height}
      padding={padding}
      margin={margin}
      marginBottom={marginBottom}
      marginTop={marginTop}
      borderStyle={borderStyle}
      borderColor={border}
      overflow={overflow}
    >
      {title && (
        <Text color={titleColor} bold={focused || variant === "overlay"}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
}
