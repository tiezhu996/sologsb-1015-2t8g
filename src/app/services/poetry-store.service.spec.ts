import { TestBed } from '@angular/core/testing';
import { METER_TEMPLATES, PoetryStoreService } from './poetry-store.service';
import type { CharacterMark, PoemWorkspace } from '../models/poem.models';

const STORAGE_KEY = 'sologsb-1015-poetry-workspace-v1';

describe('PoetryStoreService 待核队列', () => {
  let store: PoetryStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    store = TestBed.inject(PoetryStoreService);
  });

  function pendingKeys(): string[] {
    return store.queue().filter((item) => !item.record).map((item) => item.issue.key);
  }

  function firstPendingKey(): string {
    const key = pendingKeys()[0];
    expect(key).toBeTruthy();
    return key;
  }

  it('出律与平仄未定等可跟踪问题进入队列，总体提示不进入', () => {
    expect(store.queueStats().total).toBeGreaterThan(0);
    expect(store.queue().every((item) => item.issue.trackable)).toBeTrue();
    expect(store.infoIssues().length).toBeGreaterThan(0);
    expect(store.queueStats().pending).toBe(store.queueStats().total);
    expect(store.queueStats().percent).toBe(0);
  });

  it('可标记已处理，并同步总数与进度', () => {
    store.setReviewerName('张校');
    const key = firstPendingKey();
    store.resolveIssue(key, '已据平水韵改定');

    const item = store.queue().find((entry) => entry.issue.key === key);
    expect(item?.record?.status).toBe('resolved');
    expect(item?.record?.handledBy).toBe('张校');
    expect(item?.record?.reason).toBe('已据平水韵改定');
    expect(store.queueStats().resolved).toBe(1);
    expect(store.queueStats().pending).toBe(store.queueStats().total - 1);
    expect(store.queueStats().percent).toBeGreaterThan(0);
  });

  it('忽略必须填写原因，空原因被拒绝', () => {
    const key = firstPendingKey();
    expect(store.ignoreIssue(key, '   ')).toBeFalse();
    expect(store.queue().find((entry) => entry.issue.key === key)?.record).toBeUndefined();

    expect(store.ignoreIssue(key, '依宋刻本，此读可通')).toBeTrue();
    const item = store.queue().find((entry) => entry.issue.key === key);
    expect(item?.record?.status).toBe('ignored');
    expect(item?.record?.reason).toBe('依宋刻本，此读可通');
    expect(store.queueStats().ignored).toBe(1);
  });

  it('撤回结论后重新回到待核', () => {
    const key = firstPendingKey();
    store.resolveIssue(key);
    expect(pendingKeys()).not.toContain(key);
    store.reopenIssue(key);
    expect(pendingKeys()).toContain(key);
  });

  it('改正问题字后旧结论消失，问题对不上即重新待核', () => {
    const key = firstPendingKey();
    store.resolveIssue(key, '已改');

    const version = store.activeVersion();
    const [, line, position, char] = key.split('|');
    const newText = version.text.replace(char, '花');
    store.selectCell(Number(line), Number(position));
    store.updateText(newText);

    expect(store.activeVersion().reviews.some((review) => review.issueKey === key)).toBeFalse();
    const refreshed = store.queue().find((item) => item.issue.line === Number(line));
    expect(refreshed?.record).toBeUndefined();
  });

  it('无关位置改动时，仍对得上的处理结论保留', () => {
    const key = firstPendingKey();
    store.ignoreIssue(key, '暂时放过，下一班核');
    const text = store.activeVersion().text;

    // 仅改动标点（被过滤、不参与格律），问题指纹不变
    store.updateText(text.replace('，', '；'));

    const kept = store.activeVersion().reviews.find((review) => review.issueKey === key);
    expect(kept?.status).toBe('ignored');
    expect(kept?.reason).toBe('暂时放过，下一班核');
  });

  it('字音标注变化导致指纹变化时，结论回到待核', () => {
    const key = firstPendingKey();
    store.resolveIssue(key);
    const issue = store.queue().find((item) => item.issue.key === key)!.issue;

    // 原字典推断读平声，改判为“中”后仍是出律，但 actual 变了 → 指纹变化
    store.selectCell(issue.line!, issue.position!);
    store.setMark({ tone: '中' });

    expect(store.activeVersion().reviews.some((review) => review.issueKey === key)).toBeFalse();
    const renewed = store.queue().find((item) => item.issue.line === issue.line && item.issue.position === issue.position);
    expect(renewed?.record).toBeUndefined();
    expect(renewed?.issue.key).not.toBe(key);
  });

  it('切换格律模板后旧结论按新模板重新待核', () => {
    const key = firstPendingKey();
    store.resolveIssue(key);
    const other = METER_TEMPLATES.find((template) => template.id !== store.template().id)!;
    store.setTemplate(other.id);
    expect(store.activeVersion().reviews.some((review) => review.issueKey === key)).toBeFalse();
  });

  it('显式标注平仄却无依据时给出缺依据问题', () => {
    // 第一句第一字未人工标注；人工标仄且不填依据
    store.selectCell(0, 0);
    store.setMark({ tone: '仄', basis: '' });
    const missing = store.issues().find((issue) => issue.kind === 'missing-basis');
    expect(missing).toBeTruthy();
    expect(missing?.detail).toContain('依据');

    store.setMark({ basis: '《平水韵》去声' });
    expect(store.issues().some((issue) => issue.kind === 'missing-basis' && issue.position === 0)).toBeFalse();
  });

  it('另存校勘稿时处理结论随版本带走', () => {
    store.setReviewerName('李校');
    store.ignoreIssue(firstPendingKey(), '异文待考');
    store.snapshot();
    expect(store.activeVersion().reviews.length).toBe(1);
    expect(store.activeVersion().reviews[0].handledBy).toBe('李校');
  });

  it('撤销恢复处理前状态，重做恢复结论', () => {
    const key = firstPendingKey();
    store.resolveIssue(key, '处理完毕');
    store.undo();
    expect(store.activeVersion().reviews.some((review) => review.issueKey === key)).toBeFalse();
    store.redo();
    expect(store.activeVersion().reviews.find((review) => review.issueKey === key)?.reason).toBe('处理完毕');
  });

  it('导出校对稿带处理状态、原因、处理人与队列进度', () => {
    const key = firstPendingKey();
    store.setReviewerName('王校');
    store.ignoreIssue(key, '版本通假，暂不改');
    const exported = store.exportProofreadCopy();
    expect(exported).toContain('待核进度');
    expect(exported).toContain('处理状态：已忽略');
    expect(exported).toContain('版本通假，暂不改');
    expect(exported).toContain('王校');
    expect(exported).toContain('处理状态：待核');
  });

  it('空文本没有问题时进度为 100%', () => {
    store.updateText('');
    expect(store.queueStats().total).toBe(0);
    expect(store.queueStats().pending).toBe(0);
    expect(store.queueStats().percent).toBe(100);
  });

  it('旧版本数据缺 reviews 字段时自动补齐并可直接处理', () => {
    const legacy: PoemWorkspace = {
      title: '旧档',
      author: '佚名',
      templateId: 'wuyan-zeqi',
      activeVersionId: 'v1',
      updatedAt: new Date().toISOString(),
      versions: [
        {
          id: 'v1',
          name: '旧本',
          source: '',
          createdAt: new Date().toISOString(),
          text: '春眠不觉晓\n处处闻啼鸟\n夜来风雨声\n花落知多少',
          marks: {},
          antithesisPairs: [],
          // 模拟 1.0 旧档：没有 reviews
        } as unknown as PoemWorkspace['versions'][number],
      ],
    };
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(PoetryStoreService);
    expect(reloaded.activeVersion().reviews).toEqual([]);
    expect(() => reloaded.resolveIssue(reloaded.queue()[0].issue.key)).not.toThrow();
  });
});
