import React from "react";
import browser from "webextension-polyfill";
import { GithubIcon, shadersIconUrl } from "./icons";

const REPOSITORY_URL = "https://github.com/better-lyrics/shaders";

export const Header: React.FC = () => (
  <div className="header">
    <img className="brand" src={shadersIconUrl} alt="" width={22} height={22} />
    <h1 className="header__title">
      Shaders <span className="header__version">{browser.runtime.getManifest().version}</span>
    </h1>
    <a
      className="icon-button"
      href={REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="View source on GitHub"
      aria-label="View source on GitHub"
    >
      <GithubIcon size={18} />
    </a>
  </div>
);
