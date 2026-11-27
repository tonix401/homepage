import { fileIconData } from "../services/fileIcon";
import type { FileType } from "../services/types";

interface SetiIconProps {
  type: FileType;
  name?: string;
  size?: number;
}

export function SetiIcon({ type, name, size = 20 }: SetiIconProps) {
  const { char, color } = name === "LICENCE.md"
    ? { char: "", color: "#cbcb41" }
    : type === "image" && name?.toLowerCase().endsWith(".svg")
      ? { char: "", color: "#a074c4" }
      : fileIconData(type);
  return (
    <span
      aria-hidden="true"
      style={{
        fontFamily: "seti",
        fontSize: size,
        lineHeight: 1,
        color,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {char}
    </span>
  );
}
