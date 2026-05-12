import "@vscode/codicons/dist/codicon.css";
import "./ActivityBar.css";
import filesIcon from "@vscode/codicons/src/icons/files.svg";
import accountIcon from "@vscode/codicons/src/icons/account.svg";
import settingsGearIcon from "@vscode/codicons/src/icons/settings-gear.svg";
import { type CustomActivity } from "../services/types";

export type Panel = "explorer" | number;

interface ActivityBarProps {
  activities: CustomActivity[];
  activePanel: Panel | null;
  onPanelChange: (panel: Panel) => void;
}

function isFilePath(iconPath: string): boolean {
  return (
    iconPath.startsWith("/") ||
    iconPath.startsWith("./") ||
    iconPath.startsWith("../") ||
    /^https?:\/\//.test(iconPath) ||
    iconPath.startsWith("data:")
  );
}

function ActivityIcon({ iconPath }: { iconPath: string }) {
  if (isFilePath(iconPath)) {
    return <img src={iconPath} alt="" />;
  }
  return <i className={`codicon codicon-${iconPath}`} />;
}

function ImgButton({
  active,
  title,
  icon,
  onClick,
}: {
  active?: boolean;
  title: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`vscode-activity-btn${active ? " vscode-activity-btn--active" : ""}`}
      title={title}
      onClick={onClick}
      aria-label={title}
    >
      <img src={icon} alt="" />
    </button>
  );
}

function ActivityButton({
  active,
  activity,
  onClick,
}: {
  active?: boolean;
  activity: CustomActivity;
  onClick: () => void;
}) {
  return (
    <button
      className={`vscode-activity-btn${active ? " vscode-activity-btn--active" : ""}`}
      title={activity.name}
      onClick={onClick}
      aria-label={activity.name}
    >
      <ActivityIcon iconPath={activity.iconPath} />
    </button>
  );
}

export function ActivityBar({ activities, activePanel, onPanelChange }: ActivityBarProps) {
  return (
    <div className="vscode-activity-bar">
      <div className="vscode-activity-bar-top">
        <ImgButton
          active={activePanel === "explorer"}
          title="Explorer"
          icon={filesIcon}
          onClick={() => onPanelChange("explorer")}
        />
        {activities.map((activity, i) => (
          <ActivityButton
            key={i}
            active={activePanel === i}
            activity={activity}
            onClick={() => onPanelChange(i)}
          />
        ))}
      </div>
      <div className="vscode-activity-bar-bottom">
        <ImgButton title="Accounts" icon={accountIcon} onClick={() => {}} />
        <ImgButton title="Manage" icon={settingsGearIcon} onClick={() => {}} />
      </div>
    </div>
  );
}
