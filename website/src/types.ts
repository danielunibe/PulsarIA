export type SceneKey =
  | 'coreo'
  | 'serum'
  | 'pasillo'
  | 'abuela'
  | 'cachorro'
  | 'trompo'
  | 'tortillas'
  | 'study'
  | 'monstera';

export interface LibItem {
  id: string;
  h: string; // handle: e.g. @dana.baila
  c: string; // caption
  tg: string; // tag
  d: string; // duration: e.g. 0:32
  sc: SceneKey; // procedural scene key
  f: string; // filter
  op: string; // object-position
  feat?: boolean; // featured 2x2 card
  when: string; // date/time
  size: string; // file size
  list: string; // collection name
  tx: string; // transcript snippet
  pr?: number; // progress percentage if importing
  err?: string; // error message if failed
  likes?: string;
  comments?: string;
}

export interface ClusterItem {
  id: string;
  n: string; // title
  c: number; // count
  items: SceneKey[];
  note: string;
  pinned: boolean;
  concept?: string; // e.g. "Concepto semántico: Técnicas gastronómicas"
  affinity?: string; // e.g. "98% afinidad semántica"
  aiReasoning?: string; // explanation of how AI linked the ideas
  relatedConcepts?: string[];
}

export interface SearchResultItem {
  handle: string;
  timeRange: string;
  confidenceTag?: string | null;
  textSnippet: string;
}

export interface SearchModeData {
  q: string;
  meta: string;
  sem: boolean;
  items: SearchResultItem[];
}
