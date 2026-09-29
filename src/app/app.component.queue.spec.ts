import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { PoetryStoreService } from './services/poetry-store.service';

describe('AppComponent 待核队列交互', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, store: TestBed.inject(PoetryStoreService) };
  }

  it('忽略原因为空时不产生结论，并显示错误提示', () => {
    const { component, store } = setup();
    const key = store.queue()[0].issue.key;

    component.startIgnoreDraft({ issue: store.queue()[0].issue });
    component.ignoreReason.set('   ');
    component.submitIgnore(key);

    expect(component.ignoreError()).toBeTrue();
    expect(store.queue()[0].record).toBeUndefined();
  });

  it('填写原因后忽略成功并收起输入框', () => {
    const { component, store } = setup();
    const key = store.queue()[0].issue.key;
    store.setReviewerName('赵校');

    component.startIgnoreDraft({ issue: store.queue()[0].issue });
    component.ignoreReason.set('此字依集韵读仄，可通');
    component.submitIgnore(key);

    const record = store.queue().find((item) => item.issue.key === key)?.record;
    expect(record?.status).toBe('ignored');
    expect(record?.reason).toBe('此字依集韵读仄，可通');
    expect(record?.handledBy).toBe('赵校');
    expect(component.ignoreDraftKey()).toBe('');
  });

  it('筛选器只显示对应状态的队列项', () => {
    const { component, store } = setup();
    store.resolveIssue(store.queue()[0].issue.key, '已改');

    component.setQueueFilter('resolved');
    expect(component.filteredQueue().length).toBe(1);
    expect(component.filteredQueue()[0].record?.status).toBe('resolved');

    component.setQueueFilter('pending');
    expect(component.filteredQueue().every((item) => !item.record)).toBeTrue();
    expect(component.filteredQueue().length).toBe(store.queueStats().pending);
  });
});
