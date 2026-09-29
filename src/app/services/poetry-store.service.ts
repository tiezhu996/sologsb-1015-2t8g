import { computed, Injectable, signal } from '@angular/core';
import type {
  AnalysisCell,
  AnalysisLine,
  CharacterMark,
  CharDiff,
  MarkTone,
  MeterTemplate,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  QueueItem,
  QueueStats,
  ReviewRecord,
  Tone,
} from '../models/poem.models';

export const METER_TEMPLATES: MeterTemplate[] = [
  {
    id: 'wuyan-zeqi',
    name: '五言绝句 · 仄起首句不入韵',
    summary: '四句，每句五字；二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
  {
    id: 'wuyan-pingqi',
    name: '五言绝句 · 平起首句入韵',
    summary: '四句，每句五字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 5,
    pattern: ['中', '平', '中', '仄', '平', '仄', '仄', '中', '平', '仄', '中', '平', '中', '仄', '仄', '中', '平', '仄', '中', '平'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-zeqi',
    name: '七言绝句 · 仄起首句入韵',
    summary: '四句，每句七字；一、二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['仄', '仄', '中', '平', '中', '仄', '平', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中', '仄', '仄', '中', '平', '中', '仄', '中', '平', '中'],
    rhymeLines: [0, 1, 3],
  },
  {
    id: 'qiyan-pingqi',
    name: '七言绝句 · 平起首句不入韵',
    summary: '四句，每句七字；二、四句押韵',
    lineCount: 4,
    lineLength: 7,
    pattern: ['中', '平', '中', '仄', '仄', '中', '平', '仄', '仄', '中', '平', '平', '仄', '仄', '中', '平', '中', '仄', '中', '平', '仄', '仄', '中', '平', '中', '仄', '仄', '中', '平'],
    rhymeLines: [1, 3],
  },
];

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';
const REVIEWER_KEY = 'sologsb-1015-reviewer';
const PUNCTUATION = new Set(['，', '。', '！', '？', '；', '：', '、', ' ', '\t']);
const TONE_DICTIONARY: Record<string, Tone> = {
  春: '平', 眠: '平', 不: '仄', 觉: '仄', 晓: '仄', 处: '仄', 闻: '平', 啼: '平', 鸟: '仄',
  夜: '仄', 来: '平', 风: '平', 雨: '仄', 声: '平', 花: '平', 落: '仄', 知: '平', 多: '平', 少: '仄',
  国: '仄', 破: '仄', 山: '平', 河: '平', 在: '仄', 城: '平', 深: '平', 木: '仄', 草: '仄', 独: '仄',
  明: '平', 月: '仄', 高: '平', 天: '平', 故: '仄', 乡: '平', 万: '仄', 里: '仄', 江: '平', 船: '平',
};

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function key(line: number, position: number): string {
  return `${line}:${position}`;
}

function defaultMark(): CharacterMark {
  return { tone: '?', rhyme: '', pauseAfter: false, basis: '', note: '' };
}

/** 一三五不论：首、三、五字位置的出律判为可接受变体 */
function isAcceptableVariant(template: MeterTemplate, position: number): boolean {
  if (template.lineLength === 5) return position === 0 || position === 2;
  return position === 0 || position === 2 || position === 4;
}

function buildAnalysis(version: PoemVersion, template: MeterTemplate): AnalysisLine[] {
  return version.text.split('\n').map((rawLine, lineIndex) => {
    const chars = Array.from(rawLine).filter((char) => !PUNCTUATION.has(char));
    const cells: AnalysisCell[] = chars.map((char, position) => {
      const mark = version.marks[key(lineIndex, position)] ?? defaultMark();
      const expected = template.pattern[lineIndex * template.lineLength + position] ?? '中';
      const actual = mark.tone === '?' ? (TONE_DICTIONARY[char] ?? '?') : mark.tone;
      let status: AnalysisCell['status'] = 'neutral';
      let message = '标点或不计律位置';
      if (actual === '?') {
        status = 'unknown';
        message = '尚未标注平仄';
      } else if (expected === '中') {
        status = 'correct';
        message = '可平可仄';
      } else if (actual === expected) {
        status = 'correct';
        message = '合律';
      } else if (isAcceptableVariant(template, position)) {
        status = 'variant';
        message = '一三五位置的可接受变体';
      } else {
        status = 'error';
        message = `此处应为${expected}声`;
      }
      return { char, position, expected, actual, status, message, mark };
    });
    const rhymeChars = template.rhymeLines.includes(lineIndex) ? cells.slice(-1).map((cell) => cell.char) : [];
    return {
      index: lineIndex,
      cells,
      rhymeChars,
      errors: cells.filter((cell) => cell.status === 'error').length,
      variants: cells.filter((cell) => cell.status === 'variant').length,
    };
  });
}

/**
 * 由当前文本、字音标注与模板生成检查问题。
 * 每条可入队问题带稳定指纹 key：位置或相关字/平仄状态一变，key 即变，
 * 旧的处理结论对不上新指纹，自然回到待核状态。
 */
function collectIssues(analysis: AnalysisLine[], version: PoemVersion, template: MeterTemplate): PoemIssue[] {
  const issues: PoemIssue[] = [];
  analysis.forEach((line) => {
    line.cells.forEach((cell) => {
      if (cell.status === 'error') {
        issues.push({
          key: `meter-error|${line.index}|${cell.position}|${cell.char}|${cell.expected}|${cell.actual}`,
          kind: 'meter-error',
          level: 'error',
          title: '出律位置',
          detail: `第 ${line.index + 1} 句“${cell.char}”：${cell.message}`,
          line: line.index,
          position: cell.position,
          char: cell.char,
          trackable: true,
        });
      } else if (cell.status === 'unknown') {
        issues.push({
          key: `tone-unknown|${line.index}|${cell.position}|${cell.char}`,
          kind: 'tone-unknown',
          level: 'warning',
          title: '平仄未定',
          detail: `第 ${line.index + 1} 句“${cell.char}”尚未确认平仄。`,
          line: line.index,
          position: cell.position,
          char: cell.char,
          trackable: true,
        });
      }
      // 字音已人工确认，却没有留下判断依据（韵书/音义出处）
      if (cell.mark.tone !== '?' && !cell.mark.basis.trim()) {
        issues.push({
          key: `missing-basis|${line.index}|${cell.position}|${cell.char}|${cell.actual}`,
          kind: 'missing-basis',
          level: 'warning',
          title: '缺少依据',
          detail: `第 ${line.index + 1} 句“${cell.char}”已判为${cell.actual}声，但未记录判断依据。`,
          line: line.index,
          position: cell.position,
          char: cell.char,
          trackable: true,
        });
      }
    });
  });

  const rhymeGroups = new Map<string, Array<{ line: number; char: string; hasRhyme: boolean }>>();
  template.rhymeLines.forEach((lineIndex) => {
    const cell = analysis[lineIndex]?.cells.at(-1);
    if (!cell) return;
    const rhyme = cell.mark.rhyme.trim();
    if (!rhyme) {
      issues.push({
        key: `rhyme-missing|${lineIndex}|${cell.char}`,
        kind: 'rhyme-missing',
        level: 'warning',
        title: '韵脚缺少韵部',
        detail: `第 ${lineIndex + 1} 句末字“${cell.char}”尚未指定韵部。`,
        line: lineIndex,
        position: cell.position,
        char: cell.char,
        trackable: true,
      });
      return;
    }
    rhymeGroups.set(rhyme, [...(rhymeGroups.get(rhyme) ?? []), { line: lineIndex, char: cell.char, hasRhyme: true }]);
  });
  rhymeGroups.forEach((group, rhyme) => {
    const duplicate = group.find((entry, index) => group.findIndex((other) => other.char === entry.char) !== index);
    if (!duplicate) return;
    issues.push({
      key: `rhyme-duplicate|${rhyme}|${group.map((entry) => entry.line).join(',')}|${group.map((entry) => entry.char).join('')}`,
      kind: 'rhyme-duplicate',
      level: 'warning',
      title: '重复用韵',
      detail: `韵部 ${rhyme} 在第 ${group.map((entry) => entry.line + 1).join('、')} 句重复使用末字“${duplicate.char}”。`,
      line: duplicate.line,
      position: analysis[duplicate.line]?.cells.at(-1)?.position,
      char: duplicate.char,
      trackable: true,
    });
  });

  if (version.antithesisPairs.length === 0) {
    issues.push({
      key: 'antithesis-empty',
      kind: 'antithesis-empty',
      level: 'info',
      title: '尚未标记对仗',
      detail: '可在检视器中把两句建立对仗关系。',
      trackable: false,
    });
  }
  if (!issues.some((issue) => issue.level === 'error')) {
    issues.unshift({
      key: 'meter-ok',
      kind: 'meter-ok',
      level: 'info',
      title: '格律检查通过',
      detail: '当前未发现硬性出律，请继续核对可接受变体。',
      trackable: false,
    });
  }
  return issues;
}

function initialWorkspace(): PoemWorkspace {
  const now = new Date().toISOString();
  const spring = '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
  const marks: Record<string, CharacterMark> = {};
  const cells = [
    ['晓', 0, '平', false], ['鸟', 1, '平', false], ['声', 2, '平', false], ['少', 3, '平', false],
  ] as const;
  cells.forEach(([char, line, tone, pause]) => {
    marks[key(line, 4)] = { tone, rhyme: 'A', pauseAfter: pause, basis: '《平水韵》上声十七筱', note: `${char} 为韵脚` };
  });
  marks[key(0, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '句中平声' };
  marks[key(1, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '' };
  marks[key(2, 2)] = { tone: '平', rhyme: '', pauseAfter: false, basis: '平水韵', note: '' };

  const topVersion: PoemVersion = {
    id: 'version-main',
    name: '通行本 · 孟浩然集',
    source: '《孟浩然诗集笺注》',
    createdAt: now,
    text: spring,
    marks,
    antithesisPairs: [],
    reviews: [],
  };
  const variant: PoemVersion = {
    id: 'version-song',
    name: '宋刻本异文',
    source: '宋蜀刻本',
    createdAt: now,
    text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
    marks: clone(marks),
    antithesisPairs: [],
    reviews: [],
  };
  return {
    title: '春晓',
    author: '孟浩然',
    templateId: 'wuyan-zeqi',
    versions: [topVersion, variant],
    activeVersionId: topVersion.id,
    updatedAt: now,
  };
}

function loadWorkspace(): PoemWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const parsed = JSON.parse(raw) as PoemWorkspace;
    if (!parsed.versions?.length) return initialWorkspace();
    // 旧档兼容：补齐各版本的待核结论表
    parsed.versions.forEach((version) => {
      version.reviews ??= [];
    });
    return parsed;
  } catch {
    return initialWorkspace();
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Injectable({ providedIn: 'root' })
export class PoetryStoreService {
  readonly workspace = signal<PoemWorkspace>(loadWorkspace());
  readonly selectedLine = signal(0);
  readonly selectedPosition = signal(4);
  readonly baselineVersionId = signal<string>('');
  readonly currentDiffIndex = signal(0);
  readonly toast = signal('');
  readonly undoCount = signal(0);
  readonly redoCount = signal(0);
  readonly reviewerName = signal(localStorage.getItem(REVIEWER_KEY) ?? '');

  private undoStack: PoemWorkspace[] = [];
  private redoStack: PoemWorkspace[] = [];

  readonly activeVersion = computed(() => {
    const state = this.workspace();
    return state.versions.find((version) => version.id === state.activeVersionId) ?? state.versions[0];
  });

  readonly template = computed(() => {
    return METER_TEMPLATES.find((item) => item.id === this.workspace().templateId) ?? METER_TEMPLATES[0];
  });

  readonly lines = computed(() => this.activeVersion().text.split('\n'));

  readonly analysis = computed<AnalysisLine[]>(() => buildAnalysis(this.activeVersion(), this.template()));

  readonly issues = computed<PoemIssue[]>(() => collectIssues(this.analysis(), this.activeVersion(), this.template()));

  /** 总体提示（格律通过、未标对仗等），不纳入待核队列 */
  readonly infoIssues = computed<PoemIssue[]>(() => this.issues().filter((issue) => !issue.trackable));

  /** 待核队列：硬性出律、平仄未定、缺依据等待办项，附上本版本已有的处理结论 */
  readonly queue = computed<QueueItem[]>(() => {
    const reviews = this.activeVersion().reviews;
    return this.issues()
      .filter((issue) => issue.trackable)
      .map((issue) => ({ issue, record: reviews.find((review) => review.issueKey === issue.key) }));
  });

  readonly queueStats = computed<QueueStats>(() => {
    const queue = this.queue();
    const total = queue.length;
    const resolved = queue.filter((item) => item.record?.status === 'resolved').length;
    const ignored = queue.filter((item) => item.record?.status === 'ignored').length;
    const pending = total - resolved - ignored;
    return { total, resolved, ignored, pending, percent: total === 0 ? 100 : Math.round(((resolved + ignored) / total) * 100) };
  });

  readonly diff = computed<CharDiff[]>(() => {
    const left = this.workspace().versions.find((version) => version.id === this.baselineVersionId());
    const right = this.activeVersion();
    if (!left || left.id === right.id) return [];
    const leftChars = Array.from(left.text.replace(/\n/g, ''));
    const rightChars = Array.from(right.text.replace(/\n/g, ''));
    const size = Math.max(leftChars.length, rightChars.length);
    return Array.from({ length: size }, (_, index) => ({
      index,
      left: leftChars[index] ?? '',
      right: rightChars[index] ?? '',
      changed: leftChars[index] !== rightChars[index],
    }));
  });

  readonly differences = computed(() => this.diff().filter((item) => item.changed).map((item) => item.index));
  readonly baselineVersion = computed(() => this.workspace().versions.find((version) => version.id === this.baselineVersionId()));

  setReviewerName(name: string): void {
    this.reviewerName.set(name);
    localStorage.setItem(REVIEWER_KEY, name);
  }

  selectVersion(id: string): void {
    this.workspace.update((workspace) => ({ ...workspace, activeVersionId: id }));
  }

  selectCell(line: number, position: number): void {
    this.selectedLine.set(line);
    this.selectedPosition.set(position);
  }

  setTemplate(id: string): void {
    this.commit((workspace) => {
      workspace.templateId = id;
    });
  }

  updateText(text: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.text = text;
    });
  }

  updateTitle(title: string): void {
    this.commit((workspace) => {
      workspace.title = title;
    });
  }

  updateVersionSource(source: string): void {
    this.commit((workspace) => {
      this.versionIn(workspace).source = source;
    });
  }

  setMark(patch: Partial<CharacterMark>): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      const id = key(this.selectedLine(), this.selectedPosition());
      version.marks[id] = { ...defaultMark(), ...version.marks[id], ...patch };
    });
  }

  cycleTone(): void {
    const cell = this.selectedCell();
    const next: Record<Tone, MarkTone | '?'> = { '?': '平', '平': '仄', '仄': '中', '中': '?' };
    this.setMark({ tone: next[cell?.actual ?? '?'] });
  }

  togglePause(): void {
    const cell = this.selectedCell();
    this.setMark({ pauseAfter: !(cell?.mark.pauseAfter ?? false) });
  }

  cycleRhyme(): void {
    const cell = this.selectedCell();
    const current = cell?.mark.rhyme ?? '';
    const next = current === '' ? 'A' : current === 'A' ? 'B' : current === 'B' ? 'C' : '';
    this.setMark({ rhyme: next });
  }

  addAntithesis(): void {
    const line = this.selectedLine();
    const other = line === 0 ? 1 : line - 1;
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      if (version.antithesisPairs.some((pair) => pair.leftLine === line && pair.rightLine === other)) return;
      version.antithesisPairs.push({ id: uid('pair'), leftLine: Math.min(line, other), rightLine: Math.max(line, other), note: '结构相对，词性相应。' });
    });
  }

  removeAntithesis(id: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.antithesisPairs = version.antithesisPairs.filter((pair) => pair.id !== id);
    });
  }

  updateAntithesis(id: string, note: string): void {
    this.commit((workspace) => {
      const pair = this.versionIn(workspace).antithesisPairs.find((item) => item.id === id);
      if (pair) pair.note = note;
    });
  }

  /** 标记已处理：可附补充说明（选填） */
  resolveIssue(issueKey: string, note = ''): void {
    this.saveReview(issueKey, { status: 'resolved', reason: note.trim() });
  }

  /** 忽略：原因必填，空白原因一律拒绝 */
  ignoreIssue(issueKey: string, reason: string): boolean {
    const trimmed = reason.trim();
    if (!trimmed) return false;
    this.saveReview(issueKey, { status: 'ignored', reason: trimmed });
    return true;
  }

  /** 撤回结论，重新回到待核 */
  reopenIssue(issueKey: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      version.reviews = version.reviews.filter((review) => review.issueKey !== issueKey);
    });
  }

  snapshot(): void {
    const active = clone(this.activeVersion());
    active.id = uid('version');
    active.name = `校勘稿 ${this.workspace().versions.length}`;
    active.createdAt = new Date().toISOString();
    this.commit((workspace) => {
      workspace.versions.unshift(active);
      workspace.activeVersionId = active.id;
    });
    this.toast.set('已建立独立校勘稿（含待核处理记录）');
  }

  duplicateActiveAsBaseline(): void {
    this.baselineVersionId.set(this.activeVersion().id);
  }

  nextDifference(): void {
    const values = this.differences();
    if (!values.length) return;
    const current = values.findIndex((index) => index >= this.currentDiffIndex());
    this.currentDiffIndex.set(values[(current + 1) % values.length]);
  }

  previousDifference(): void {
    const values = this.differences();
    if (!values.length) return;
    const reverse = [...values].reverse();
    const current = reverse.findIndex((index) => index <= this.currentDiffIndex());
    this.currentDiffIndex.set(reverse[(current + 1) % reverse.length]);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.workspace()));
    this.workspace.set(previous);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.workspace()));
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
    this.persist();
  }

  exportProofreadCopy(): string {
    const active = this.activeVersion();
    const stats = this.queueStats();
    const toneLines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const notes = this.issues().map((issue) => {
      const prefix = `[${issue.level.toUpperCase()}] ${issue.title}：${issue.detail}`;
      if (!issue.trackable) return prefix;
      const record = active.reviews.find((review) => review.issueKey === issue.key);
      if (!record) return `${prefix}\n　处理状态：待核`;
      if (record.status === 'resolved') {
        const suffix = record.reason ? `；说明：${record.reason}` : '';
        return `${prefix}\n　处理状态：已处理（${record.handledBy} · ${formatTime(record.handledAt)}${suffix}）`;
      }
      return `${prefix}\n　处理状态：已忽略（原因：${record.reason}；${record.handledBy} · ${formatTime(record.handledAt)}）`;
    });
    const progress = `待核进度：共 ${stats.total} 条，已处理 ${stats.resolved} 条，已忽略 ${stats.ignored} 条，待核 ${stats.pending} 条（${stats.percent}%）`;
    return [
      `# ${this.workspace().title} · 格律校对稿`,
      '',
      `底本：${active.name}`,
      `出处：${active.source}`,
      '',
      '## 字音标注',
      ...toneLines,
      '',
      '## 检查记录',
      progress,
      '',
      ...notes,
    ].join('\n');
  }

  downloadProofreadCopy(): void {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([this.exportProofreadCopy()], { type: 'text/markdown;charset=utf-8' }));
    anchor.download = `${this.workspace().title}-格律校对稿.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  selectedCell(): AnalysisCell | undefined {
    return this.analysis()[this.selectedLine()]?.cells[this.selectedPosition()];
  }

  private saveReview(issueKey: string, patch: { status: ReviewRecord['status']; reason: string }): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      const handledBy = this.reviewerName().trim() || '未署名';
      const record: ReviewRecord = {
        issueKey,
        status: patch.status,
        reason: patch.reason,
        handledBy,
        handledAt: new Date().toISOString(),
      };
      version.reviews = [...version.reviews.filter((review) => review.issueKey !== issueKey), record];
    });
  }

  private commit(mutator: (workspace: PoemWorkspace) => void): void {
    this.undoStack.push(clone(this.workspace()));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const next = clone(this.workspace());
    mutator(next);
    this.pruneStaleReviews(next);
    next.updatedAt = new Date().toISOString();
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(0);
    this.persist();
  }

  /**
   * 正文、字音标注或模板改动后，逐版本重算问题指纹：
   * 只保留仍能对得上当前问题的处理结论；位置或内容变了的一律移除，回到待核。
   */
  private pruneStaleReviews(workspace: PoemWorkspace): void {
    const template = METER_TEMPLATES.find((item) => item.id === workspace.templateId) ?? METER_TEMPLATES[0];
    workspace.versions.forEach((version) => {
      version.reviews ??= [];
      const liveKeys = new Set(collectIssues(buildAnalysis(version, template), version, template).map((issue) => issue.key));
      version.reviews = version.reviews.filter((review) => liveKeys.has(review.issueKey));
    });
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    const version = workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
    version.reviews ??= [];
    return version;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }
}
