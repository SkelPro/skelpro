export type JsonStructure = {
  [key: string]: Object | string
}

export interface Answers {
  action: string;
  srcPath: string;
  url: string;
  fileName: string;
  baseName: string;
  install: boolean;
}
