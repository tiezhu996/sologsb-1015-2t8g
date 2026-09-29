import { computed, Injectable, signal } from '@angular/core';
import type {
  AnalysisCell,
  AnalysisLine,
  AntithesisPair,
  CharacterMark,
  CharDiff,
  MarkTone,
  MeterTemplate,
  PoemIssue,
  PoemVersion,
  PoemWorkspace,
  ReviewDecision,
  ReviewStatus,
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

export const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';
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

export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultMark(): CharacterMark {
  return { tone: '?', rhyme: '', pauseAfter: false, basis: '', note: '' };
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

  const variants = spring.replace('处处闻啼鸟', '处处闻啼鸟');
  const topVersion: PoemVersion = {
    id: 'version-main',
    name: '通行本 · 孟浩然集',
    source: '《孟浩然诗集笺注》',
    createdAt: now,
    text: variants,
    marks,
    antithesisPairs: [],
    reviewQueue: {},
  };
  const variant: PoemVersion = {
    id: 'version-song',
    name: '宋刻本异文',
    source: '宋蜀刻本',
    createdAt: now,
    text: '春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。',
    marks: clone(marks),
    antithesisPairs: [],
    reviewQueue: {},
  };
  return {
    title: '春晓',
    author: '孟浩然',
    templateId: 'wuyan-zeqi',
    reviewer: '',
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
    parsed.reviewer ??= '';
    parsed.versions.forEach((version) => {
      version.reviewQueue ??= {};
    });
    return parsed;
  } catch {
    return initialWorkspace();
  }
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

  readonly analysis = computed<AnalysisLine[]>(() => {
    return this.buildAnalysis(this.activeVersion(), this.template());
  });

  private buildAnalysis(version: PoemVersion, template: MeterTemplate): AnalysisLine[] {
    return version.text.split('\n').map((line, lineIndex) => {
      const chars = Array.from(line).filter((char) => !PUNCTUATION.has(char));
      const cells: AnalysisCell[] = chars.map((char, position) => {
        const mark = version.marks[key(lineIndex, position)] ?? defaultMark();
        const expected = template.pattern[lineIndex * template.lineLength + position] ?? '中';
        const fromDictionary = TONE_DICTIONARY[char];
        const actual = mark.tone === '?' ? (fromDictionary ?? '?') : mark.tone;
        let status: AnalysisCell['status'] = 'neutral';
        let message = '标点或不计律位置';
        if (PUNCTUATION.has(char)) {
          status = 'neutral';
        } else if (actual === '?') {
          status = 'unknown';
          message = '尚未标注平仄';
        } else if (expected === '中') {
          status = 'correct';
          message = '可平可仄';
        } else if (actual === expected) {
          status = 'correct';
          message = '合律';
        } else if (this.isAcceptableVariant(template, lineIndex, position)) {
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

  readonly issues = computed<PoemIssue[]>(() => {
    return this.buildIssues(this.activeVersion(), this.template());
  });

  private buildIssues(version: PoemVersion, template: MeterTemplate): PoemIssue[] {
    const analysis = this.buildAnalysis(version, template);
    const issues: PoemIssue[] = [];
    analysis.forEach((line) => {
      line.cells.forEach((cell) => {
        if (cell.status === 'error') {
          issues.push({
            key: `error:meter:${line.index}:${cell.position}:${cell.char}:${cell.actual}→${cell.expected}`,
            level: 'error',
            title: '出律位置',
            detail: `第 ${line.index + 1} 句第 ${cell.position + 1} 字“${cell.char}”（${cell.actual}声）：${cell.message}`,
            line: line.index,
            position: cell.position,
          });
        }
        if (cell.status === 'unknown') {
          issues.push({
            key: `warning:unknown:${line.index}:${cell.position}:${cell.char}`,
            level: 'warning',
            title: '平仄未定',
            detail: `第 ${line.index + 1} 句第 ${cell.position + 1} 字“${cell.char}”平仄尚未确认。`,
            line: line.index,
            position: cell.position,
          });
        }
        const mark = version.marks[key(line.index, cell.position)];
        const manuallyToned = !!mark && mark.tone !== '?' && !mark.basis.trim();
        const manuallyRhymed = !!mark && !!mark.rhyme && !mark.basis.trim();
        if (manuallyToned || manuallyRhymed) {
          issues.push({
            key: `warning:basis:${line.index}:${cell.position}:${cell.char}`,
            level: 'warning',
            title: '判断缺依据',
            detail: `第 ${line.index + 1} 句第 ${cell.position + 1} 字“${cell.char}”已${manuallyRhymed ? '标韵组' : '定平仄'}，但未记录韵书或音义依据。`,
            line: line.index,
            position: cell.position,
          });
        }
      });
    });
    const rhymeCells = template.rhymeLines
      .map((lineIndex) => ({ lineIndex, cell: analysis[lineIndex]?.cells.at(-1) }))
      .filter((item): item is { lineIndex: number; cell: AnalysisCell } => Boolean(item.cell));
    const rhymeGroups = new Map<string, { char: string; line: number }[]>();
    rhymeCells.forEach(({ lineIndex, cell }) => {
      if (!cell.mark.rhyme) {
        issues.push({
          key: `warning:rhyme-missing:${lineIndex}`,
          level: 'warning',
          title: '韵脚缺少韵部',
          detail: `第 ${lineIndex + 1} 句末字“${cell.char}”尚未指定韵部。`,
          line: lineIndex,
          position: cell.position,
        });
        return;
      }
      rhymeGroups.set(cell.mark.rhyme, [...(rhymeGroups.get(cell.mark.rhyme) ?? []), { char: cell.char, line: lineIndex }]);
    });
    rhymeGroups.forEach((items, rhyme) => {
      const duplicate = items.find((item) => items.some((other) => other !== item && other.char === item.char));
      if (duplicate) {
        const lines = items.filter((item) => item.char === duplicate.char).map((item) => `第 ${item.line + 1} 句`).join('、');
        issues.push({
          key: `warning:rhyme-dup:${rhyme}:${duplicate.char}`,
          level: 'warning',
          title: '重复用韵',
          detail: `韵部 ${rhyme} 在${lines}重复使用末字“${duplicate.char}”。`,
          line: duplicate.line,
        });
      }
    });
    if (version.antithesisPairs.length === 0) {
      issues.push({ key: 'info:antithesis-empty', level: 'info', title: '尚未标记对仗', detail: '可在右侧把两句建立对仗关系。' });
    }
    if (!issues.some((issue) => issue.level === 'error')) {
      issues.unshift({ key: 'info:meter-ok', level: 'info', title: '格律检查通过', detail: '当前未发现硬性出律，请继续核对可接受变体。' });
    }
    return issues;
  }

  /** 进入待核队列的问题：出律、未定平仄、缺依据、用韵异常；纯提示性 info 不入队。 */
  readonly queueIssues = computed<PoemIssue[]>(() => {
    return this.issues().filter((issue) => issue.level === 'error' || issue.level === 'warning');
  });

  readonly infoIssues = computed<PoemIssue[]>(() => {
    return this.issues().filter((issue) => issue.level === 'info');
  });

  readonly queue = computed<{ issue: PoemIssue; status: ReviewStatus; decision?: ReviewDecision }[]>(() => {
    const queue = this.activeVersion().reviewQueue;
    return this.queueIssues().map((issue) => ({
      issue,
      status: queue[issue.key]?.status ?? 'pending',
      decision: queue[issue.key],
    }));
  });

  readonly queueStats = computed(() => {
    const items = this.queue();
    const pending = items.filter((item) => item.status === 'pending').length;
    const resolved = items.filter((item) => item.status === 'resolved').length;
    const ignored = items.filter((item) => item.status === 'ignored').length;
    const total = items.length;
    const reviewed = resolved + ignored;
    return { total, pending, resolved, ignored, reviewed, percent: total === 0 ? 100 : Math.round((reviewed / total) * 100) };
  });

  resolveIssue(issueKey: string): void {
    this.recordDecision(issueKey, 'resolved', '已处理：问题已核对并处理。');
  }

  ignoreIssue(issueKey: string, reason: string): string | null {
    const trimmed = reason.trim();
    if (!trimmed) return '忽略时必须填写原因，便于下一班核对。';
    this.recordDecision(issueKey, 'ignored', trimmed);
    return null;
  }

  reopenIssue(issueKey: string): void {
    this.commit((workspace) => {
      delete this.versionIn(workspace).reviewQueue[issueKey];
    });
  }

  private recordDecision(issueKey: string, status: 'resolved' | 'ignored', reason: string): void {
    this.commit((workspace) => {
      const version = this.versionIn(workspace);
      if (!this.issueKeysFor(version, this.templateFor(workspace)).has(issueKey)) return;
      version.reviewQueue[issueKey] = {
        status,
        reason,
        by: workspace.reviewer.trim() || '未署名',
        at: new Date().toISOString(),
      };
    });
  }

  setReviewer(name: string): void {
    this.commit((workspace) => {
      workspace.reviewer = name;
    });
  }

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

  snapshot(): void {
    const active = clone(this.activeVersion());
    active.id = uid('version');
    active.name = `校勘稿 ${this.workspace().versions.length}`;
    active.createdAt = new Date().toISOString();
    this.commit((workspace) => {
      workspace.versions.unshift(active);
      workspace.activeVersionId = active.id;
    });
    this.toast.set('已建立独立校勘稿');
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
    const workspace = this.workspace();
    const active = this.activeVersion();
    const lines = this.analysis().map((line) => {
      const tags = line.cells.map((cell) => `${cell.char}${cell.actual === '?' ? '□' : `(${cell.actual})`}`).join(' ');
      return `第 ${line.index + 1} 句：${tags}`;
    });
    const stats = this.queueStats();
    const statusLabel: Record<ReviewStatus, string> = { pending: '待核', resolved: '已处理', ignored: '已忽略' };
    const notes = this.issues().map((issue) => {
      if (issue.level === 'info') return `- [提示] ${issue.title}：${issue.detail}`;
      const decision = active.reviewQueue[issue.key];
      const head = `- [${issue.level === 'error' ? '出律' : '待核'}] ${issue.title}：${issue.detail}`;
      if (!decision) return `${head}　**【${statusLabel.pending}】**`;
      return `${head}　**【${statusLabel[decision.status]}】** ${decision.reason}（${decision.by} · ${formatStamp(decision.at)}）`;
    });
    return [
      `# ${workspace.title} · 格律校对稿`,
      '',
      `底本：${active.name}`,
      `出处：${active.source}`,
      `当班校对：${workspace.reviewer.trim() || '未署名'}`,
      `导出时间：${formatStamp(new Date().toISOString())}`,
      '',
      '## 字音标注',
      ...lines,
      '',
      '## 待核队列进度',
      `共 ${stats.total} 条：待核 ${stats.pending} 条，已处理 ${stats.resolved} 条，已忽略 ${stats.ignored} 条；完成 ${stats.percent}%。`,
      '',
      '## 检查记录',
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

  private commit(mutator: (workspace: PoemWorkspace) => void): void {
    const previous = clone(this.workspace());
    this.undoStack.push(previous);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    const next = clone(this.workspace());
    mutator(next);
    next.updatedAt = new Date().toISOString();
    this.reconcileQueue(previous, next);
    this.workspace.set(next);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(0);
    this.persist();
  }

  /**
   * 正文、字音标注或模板改动后重新计算问题指纹：
   * 只保留仍对得上同一条问题的处理结论，问题消失或位置/要素变动的结论作废、重新待核。
   */
  private reconcileQueue(before: PoemWorkspace, after: PoemWorkspace): void {
    after.versions.forEach((version) => {
      const previous = before.versions.find((item) => item.id === version.id);
      if (!previous || !Object.keys(version.reviewQueue).length) return;
      // 始终以最新正文、字音标注与模板重算指纹；无变化时指纹集合相同，不会误删结论。
      const valid = this.issueKeysFor(version, this.templateFor(after));
      Object.keys(version.reviewQueue).forEach((key) => {
        if (!valid.has(key)) delete version.reviewQueue[key];
      });
    });
  }

  private templateFor(workspace: PoemWorkspace): MeterTemplate {
    return METER_TEMPLATES.find((item) => item.id === workspace.templateId) ?? METER_TEMPLATES[0];
  }

  private issueKeysFor(version: PoemVersion, template: MeterTemplate): Set<string> {
    return new Set(this.buildIssues(version, template).map((issue) => issue.key));
  }

  private versionIn(workspace: PoemWorkspace): PoemVersion {
    const version = workspace.versions.find((item) => item.id === workspace.activeVersionId) ?? workspace.versions[0];
    return version;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace()));
  }

  private isAcceptableVariant(template: MeterTemplate, line: number, position: number): boolean {
    if (template.lineLength === 5) return position === 0 || position === 2;
    return position === 0 || position === 2 || position === 4;
  }
}
