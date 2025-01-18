export type JsonStructure = {
  [key: string]: Object | string
}

export interface Answers {
  action: string;
  srcPath: string;
  fileName: string;
  url: string;
}
