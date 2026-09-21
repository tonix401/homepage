import "./Win11Desktop.css";
import wallpaper from "/arch_background.svg";
import vscodeIcon from "/blue_dot.svg";
import archLogo from "/white_arch.svg";

interface Win11DesktopProps {
  onOpen: () => void;
}

export function Win11Desktop({ onOpen }: Win11DesktopProps) {
  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="win11-desktop">
      <div className="win11-wallpaper">
        <img
          src={wallpaper}
          alt="Windows 11 Wallpaper"
          className="win11-wallpaper-img"
        />
        <button
          className="win11-desktop-shortcut"
          onClick={onOpen}
          title="Portfolio"
        >
          <span className="win11-shortcut-icon" aria-hidden="true">
            <img src={vscodeIcon} alt="Portfolio" />
          </span>
          <span className="win11-shortcut-label">Portfolio</span>
        </button>
      </div>

      <div className="win11-taskbar">
        <div className="win11-taskbar-center">
          <button className="win11-start" aria-label="Start">
            <img src={archLogo} width="60px" alt="Start" />
          </button>
          <button
            className="win11-app-btn"
            onClick={onOpen}
            title="Portfolio"
          >
            <img
              src={vscodeIcon}
              alt="Portfolio"
              height={24}
              width={24}
            />
            Portfolio
          </button>
        </div>

        <div className="win11-tray">
          <div className="win11-clock">
            <span>{time}</span>
            <span>{date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
