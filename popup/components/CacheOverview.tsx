import React from "react";
import { useCacheInfo } from "@/popup/hooks";
import { ExportIcon, ImportIcon, TrashIcon } from "./icons";

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  const precision = i === 0 ? 0 : 2;
  return `${value.toFixed(precision)} ${units[i]}`;
};

export const CacheOverview: React.FC = () => {
  const { count, sizeBytes, isClearing, lastError, clear, exportCache, importCache } = useCacheInfo();

  return (
    <div className="cache">
      <div className="cache__head">
        <span className="cache__title">Animated art cache</span>
        <button
          type="button"
          className="mini-button"
          onClick={importCache}
          title="Import cache"
          aria-label="Import cache"
        >
          <ImportIcon size={14} />
        </button>
        <button
          type="button"
          className="mini-button"
          onClick={exportCache}
          disabled={count === 0}
          title="Export cache"
          aria-label="Export cache"
        >
          <ExportIcon size={14} />
        </button>
        <button
          type="button"
          className="mini-button"
          onClick={clear}
          disabled={isClearing || count === 0}
          title={isClearing ? "Clearing cache" : "Clear cache"}
          aria-label="Clear cache"
        >
          <TrashIcon size={14} />
        </button>
      </div>
      <div className="cache__row">
        <span className="cache__label">Cached albums</span>
        <span className="cache__dots" aria-hidden="true" />
        <span className="cache__value">{count}</span>
      </div>
      <div className="cache__row">
        <span className="cache__label">Cache size</span>
        <span className="cache__dots" aria-hidden="true" />
        <span className="cache__value">{formatBytes(sizeBytes)}</span>
      </div>
      {lastError && <p className="cache__error">{lastError}</p>}
    </div>
  );
};
