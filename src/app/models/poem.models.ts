export type Tone = '平' | '仄' | '中' | '?';
export type MarkTone = '平' | '仄' | '中';

export interface CharacterMark {
  tone: MarkTone | '?';
  rhyme: string;
  pauseAfter: boolean;
  basis: string;
  note: string;
}

export interface PoemVersion {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  text: string;
  marks: Record<string, CharacterMark>;
  antithesisPairs: AntithesisPair[];
  /** 待核队列中各问题的处理结论，按问题稳定指纹存放 */
  reviews: ReviewRecord[];
}

export interface AntithesisPair {
  id: string;
  leftLine: number;
  rightLine: number;
  note: string;
}

export interface PoemWorkspace {
  title: string;
  author: string;
  templateId: string;
  versions: PoemVersion[];
  activeVersionId: string;
  updatedAt: string;
}

export interface MeterTemplate {
  id: string;
  name: string;
  summary: string;
  lineCount: number;
  lineLength: number;
  pattern: Tone[];
  rhymeLines: number[];
}

export interface AnalysisCell {
  char: string;
  position: number;
  expected: Tone;
  actual: Tone;
  status: 'correct' | 'variant' | 'error' | 'unknown' | 'neutral';
  message: string;
  mark: CharacterMark;
}

export interface AnalysisLine {
  index: number;
  cells: AnalysisCell[];
  rhymeChars: string[];
  errors: number;
  variants: number;
}

/** 检查问题类别，决定稳定指纹的构成 */
export type IssueKind =
  | 'meter-error'
  | 'tone-unknown'
  | 'missing-basis'
  | 'rhyme-missing'
  | 'rhyme-duplicate'
  | 'antithesis-empty'
  | 'meter-ok';

export interface PoemIssue {
  /** 稳定指纹：类型 + 位置 + 相关字与模板状态，任一变化即生成新问题 */
  key: string;
  kind: IssueKind;
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  line?: number;
  position?: number;
  char?: string;
  /** 硬性出律、平仄未定、缺依据等待办项为 true；总体提示不入待核队列 */
  trackable: boolean;
}

export type ReviewStatus = 'resolved' | 'ignored';

export interface ReviewRecord {
  /** 对应 PoemIssue.key */
  issueKey: string;
  status: ReviewStatus;
  /** 忽略时必填；已处理时可为补充说明 */
  reason: string;
  handledBy: string;
  handledAt: string;
}

export interface QueueItem {
  issue: PoemIssue;
  record?: ReviewRecord;
}

export interface QueueStats {
  total: number;
  resolved: number;
  ignored: number;
  pending: number;
  percent: number;
}

export interface CharDiff {
  index: number;
  left: string;
  right: string;
  changed: boolean;
}
