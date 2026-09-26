/**
 * VSCode's Source Control view, over this site's own repository: the commit
 * box, which only looks the part, and the Graph section listing every
 * commit, newest first. They are read from git at build time
 * (`src/services/gitLog.ts`), and each opens its page on GitHub in a new tab.
 */
import { useState } from "react";
import { branch, commits, repoUrl } from "virtual:git-log";
import type { Commit } from "../services/gitLog";
import { timeAgo } from "../utils/timeAgo";
import "./SourceControl.css";

interface SourceControlProps {
  title: string;
}

function CommitRow({ commit, index }: { commit: Commit; index: number }) {
  const date = new Date(commit.date);
  const first = index === 0;
  // The whole history is listed, so the last row is the root commit.
  const root = index === commits.length - 1;
  const lane = `vscode-scm-lane${first ? " vscode-scm-lane--head" : ""}${root ? " vscode-scm-lane--root" : ""}`;
  // The row has room for the message and nothing else, as in VSCode's graph;
  // who, when and which commit are in the tooltip.
  const tooltip =
    `${commit.subject}\n\n${commit.hash.slice(0, 7)} · ${commit.author} · ` +
    `${timeAgo(date)} (${date.toLocaleString()})`;
  const content = (
    <>
      <span className={lane} aria-hidden="true" />
      <span className="vscode-scm-subject">{commit.subject}</span>
      {first && branch && (
        <span className="vscode-scm-ref">
          <i className="codicon codicon-git-branch" aria-hidden="true" />
          {branch}
        </span>
      )}
    </>
  );
  return (
    <li>
      {/* Without a GitHub remote there is nowhere to link, and the row is text. */}
      {repoUrl ? (
        <a
          className="vscode-scm-row"
          href={`${repoUrl}/commit/${commit.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          title={tooltip}
        >
          {content}
        </a>
      ) : (
        <div className="vscode-scm-row" title={tooltip}>
          {content}
        </div>
      )}
    </li>
  );
}

export function SourceControl({ title }: SourceControlProps) {
  const [graphOpen, setGraphOpen] = useState(true);

  return (
    <div className="vscode-scm">
      <div className="vscode-explorer-heading">{title}</div>

      <div className="vscode-scm-commit">
        <textarea
          className="vscode-scm-message"
          rows={1}
          readOnly
          placeholder="Major Tom to Source Control"
          aria-label="Commit message"
        />
        <button className="vscode-scm-commit-btn" disabled>
          <i className="codicon codicon-check" aria-hidden="true" />
          Commit
        </button>
      </div>

      <button
        className="vscode-scm-section"
        aria-expanded={graphOpen}
        onClick={() => setGraphOpen((open) => !open)}
      >
        <i
          className={`codicon codicon-chevron-${graphOpen ? "down" : "right"}`}
          aria-hidden="true"
        />
        Graph
      </button>

      {graphOpen &&
        (commits.length > 0 ? (
          <ol className="vscode-scm-graph">
            {commits.map((commit, i) => (
              <CommitRow key={commit.hash} commit={commit} index={i} />
            ))}
          </ol>
        ) : (
          <p className="vscode-scm-empty">No history was found for this repository.</p>
        ))}
    </div>
  );
}
