export type ExternalLinkMetadata = {
  state?: string;
  merged?: boolean;
  mergedAt?: string;
  draft?: boolean;
  branch?: string;
  author?: string;
  // "kaneo" is the pre-rename value; still present on links created before
  // the Kaneo->Riuna rename, so both are accepted.
  createdFrom?:
    | "github"
    | "riuna"
    | "kaneo"
    | "gitea"
    | "gitea-import"
    | "github-import";
  lastCommit?: {
    sha: string;
    message: string;
    author?: string;
    timestamp: string;
  };
};

export type ExternalLink = {
  id: string;
  taskId: string;
  integrationId: string;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: ExternalLinkMetadata | null;
  createdAt?: string;
  updatedAt?: string;
  integration?: {
    id: string;
    type: string;
  };
};
