import "./Win11Desktop.css";
import wallpaper from "/windowsbackground.jpg";
import vscodeIcon from "/blue_dot.svg";

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
          title="Visual Studio Code"
        >
          <span className="win11-shortcut-icon" aria-hidden="true">
            <img src={vscodeIcon} alt="Visual Studio Code" />
          </span>
          <span className="win11-shortcut-label">Visual Studio Code</span>
        </button>
      </div>

      <div className="win11-taskbar">
        <div className="win11-taskbar-center">
          <button className="win11-start" aria-label="Start">
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="2"
                width="9"
                height="9"
                rx="1"
                fill="white"
                opacity="1"
              />
              <rect
                x="13"
                y="2"
                width="9"
                height="9"
                rx="1"
                fill="white"
                opacity="1"
              />
              <rect
                x="2"
                y="13"
                width="9"
                height="9"
                rx="1"
                fill="white"
                opacity="1"
              />
              <rect
                x="13"
                y="13"
                width="9"
                height="9"
                rx="1"
                fill="white"
                opacity="1"
              />
            </svg>
          </button>
          <button
            className="win11-app-btn"
            onClick={onOpen}
            title="Visual Studio Code"
          >
            <img
              src={vscodeIcon}
              alt="Visual Studio Code"
              height={24}
              width={24}
            />
            Visual Studio Code
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
