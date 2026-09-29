import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the poetry editor', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('初始即有待核队列与统计', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const stats = fixture.componentInstance.store.queueStats();
    expect(stats.total).toBe(stats.pending + stats.resolved + stats.ignored);
    expect(stats.percent).toBeGreaterThanOrEqual(0);
  });

  it('忽略空原因不会生效', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const key = component.store.queueIssues()[0].key;
    expect(component.store.ignoreIssue(key, '   ')).toBeTruthy();
    expect(component.store.queueStats().ignored).toBe(0);
  });
});
