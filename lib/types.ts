export type Article = {
  id: string;
  title: string;
  normalizedTitle: string;
  description: string;
  source: string;
  createdAt: string;
  modifiedAt: string;
  categories: string[];
  aliases: string[];
  redirectTo?: string;
  trashedAt?: string;
};

export type Revision = {
  id: string;
  articleId: string;
  number: number;
  title: string;
  description: string;
  source: string;
  timestamp: string;
  summary: string;
  minor: boolean;
};

export type MediaItem = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  alt: string;
  createdAt: string;
};

export type WikiSettings = {
  id: "appearance";
  theme: "light" | "dark" | "auto";
  textSize: "small" | "standard" | "large";
  width: "standard" | "wide";
};

export type WikiProject = {
  format: "cockipedia-project";
  version: 1;
  exportedAt: string;
  articles: Article[];
  revisions: Revision[];
  media: MediaItem[];
  settings: WikiSettings[];
};
