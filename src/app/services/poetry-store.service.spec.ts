import { PoetryStoreService, STORAGE_KEY } from './poetry-store.service';

describe('PoetryStoreService · 待核队列', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));

  function service(): PoetryStoreService {
    return new PoetryStoreService();
  }

  it('检查结果使用稳定指纹，重复读取 key 不变', () => {
    const store = service();
    const first = store.queueIssues().map((issue) => issue.key);
    const second = store.queueIssues().map((issue) => issue.key);
    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
  });

  it('问题可标为已处理，并计入进度', () => {
    const store = service();
    const target = store.queueIssues()[0];
    expect(store.queueStats().reviewed).toBe(0);
    store.resolveIssue(target.key);
    const item = store.queue().find((entry) => entry.issue.key === target.key);
    expect(item?.status).toBe('resolved');
    expect(item?.decision?.by).toBe('未署名');
    expect(store.queueStats().reviewed).toBe(1);
    expect(store.queueStats().percent).toBeGreaterThan(0);
  });

  it('处理结论带上署名与时间', () => {
    const store = service();
    store.setReviewer('张校');
    const target = store.queueIssues()[0];
    store.resolveIssue(target.key);
    const decision = store.queue().find((entry) => entry.issue.key === target.key)?.decision;
    expect(decision?.by).toBe('张校');
    expect(decision?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('忽略必须填写原因，空原因被拒绝', () => {
    const store = service();
    const target = store.queueIssues()[0];
    expect(store.ignoreIssue(target.key, '   ')).toBeTruthy();
    expect(store.queueStats().ignored).toBe(0);
    expect(store.ignoreIssue(target.key, '孤平可从宽，见《诗律》')).toBeNull();
    const item = store.queue().find((entry) => entry.issue.key === target.key);
    expect(item?.status).toBe('ignored');
    expect(item?.decision?.reason).toContain('孤平');
  });

  it('重新待核会清除原有结论', () => {
    const store = service();
    const target = store.queueIssues()[0];
    store.ignoreIssue(target.key, '从宽处理');
    store.reopenIssue(target.key);
    const item = store.queue().find((entry) => entry.issue.key === target.key);
    expect(item?.status).toBe('pending');
    expect(item?.decision).toBeUndefined();
  });

  it('改动字音使问题消失后，原处理结论作废', () => {
    const store = service();
    const target = store.queueIssues().find((issue) => issue.level === 'error')!;
    expect(target).toBeTruthy();
    store.ignoreIssue(target.key, '从宽');
    expect(store.activeVersion().reviewQueue[target.key]).toBeDefined();
    // 找到该字按模板应有的平仄，改成合律后原指纹消失
    store.selectCell(target.line!, target.position!);
    const cell = store.selectedCell()!;
    store.setMark({ tone: cell.expected === '中' ? '平' : cell.expected });
    expect(store.activeVersion().reviewQueue[target.key]).toBeUndefined();
  });

  it('模板改动后对不上指纹的结论重新待核', () => {
    const store = service();
    const target = store.queueIssues()[0];
    store.ignoreIssue(target.key, '从宽');
    store.setTemplate('wuyan-pingqi');
    expect(store.activeVersion().reviewQueue[target.key]).toBeUndefined();
    expect(store.queueStats().ignored).toBe(0);
  });

  it('导出的校对稿包含处理状态、原因与处理人', () => {
    const store = service();
    store.setReviewer('李校');
    const first = store.queueIssues()[0];
    store.ignoreIssue(first.key, '版本异文从旧本');
    const text = store.exportProofreadCopy();
    expect(text).toContain('待核队列进度');
    expect(text).toContain('【已忽略】');
    expect(text).toContain('版本异文从旧本');
    expect(text).toContain('李校');
    expect(text).toContain('待核');
  });
});
