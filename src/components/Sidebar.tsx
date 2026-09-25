import { type ReactNode } from "react";
import "./Sidebar.css";

interface SidebarProps {
  children: ReactNode;
  /** Hidden rather than unmounted, so the explorer keeps its open folders. */
  open: boolean;
}

export function Sidebar({ children, open }: SidebarProps) {
  return <aside className="vscode-sidebar" hidden={!open}>{children}</aside>;
}
