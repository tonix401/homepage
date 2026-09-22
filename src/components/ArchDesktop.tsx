import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import wallpaper from "/arch_background.svg";
import vscodeIcon from "/blue_dot.svg";

interface ArchDesktopProps {
  onOpen: () => void;
}

export function ArchDesktop({ onOpen }: ArchDesktopProps) {
  return (
    <div className="arch-desktop">
      <Waybar onOpen={onOpen} />
      <div className="arch-wallpaper">
        <img
          src={wallpaper}
          alt=""
          className="arch-wallpaper-img"
        />
        <button
          className="arch-desktop-shortcut"
          onClick={onOpen}
          title="Portfolio"
        >
          <span className="arch-shortcut-icon" aria-hidden="true">
            <img src={vscodeIcon} alt="Portfolio" />
          </span>
          <span className="arch-shortcut-label">Portfolio</span>
        </button>
      </div>
    </div>
  );
}
