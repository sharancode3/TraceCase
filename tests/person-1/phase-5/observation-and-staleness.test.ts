import { describe, it, expect } from 'vitest';
import {
  ObservationManager,
  ObservationResolutionError,
} from '@/server/browser/observation-manager';

describe('P1-05: ObservationManager, Staleness, and Ambiguity Guards', () => {
  it('manages document generations and increments generation upon navigation', () => {
    const manager = new ObservationManager(1);
    expect(manager.getCurrentGeneration()).toBe(1);

    manager.notifyNavigation();
    expect(manager.getCurrentGeneration()).toBe(2);

    manager.notifyNavigation('page-popup');
    expect(manager.getCurrentGeneration()).toBe(3);
  });

  it('rejects stale element references across navigation boundaries', async () => {
    const manager = new ObservationManager(1);

    // Mock page with query selector
    const mockPage: any = {
      url: () => 'https://staging.example.com/login',
      title: async () => 'Login Page',
      evaluate: async () => [
        {
          tagName: 'button',
          ariaRole: 'button',
          textSnippet: 'Submit',
          isInteractive: true,
          selector: 'button#submit-btn',
        },
      ],
      locator: () => ({
        count: async () => 1,
      }),
    };

    const obs = await manager.captureFreshObservation(mockPage, 1);
    expect(obs.visibleDomElements.length).toBe(1);
    const elementRef = obs.visibleDomElements[0].elementRef;

    // Resolves cleanly in generation 1
    const res = await manager.resolveElementLocator(mockPage, elementRef);
    expect(res.reference.elementRef).toBe(elementRef);

    // Navigate to next page -> increments generation and invalidates old references
    manager.notifyNavigation();

    await expect(
      manager.resolveElementLocator(mockPage, elementRef)
    ).rejects.toThrow(ObservationResolutionError);

    try {
      await manager.resolveElementLocator(mockPage, elementRef);
    } catch (err: any) {
      expect(err.code).toBe('NOT_FOUND'); // cleared upon navigation
    }
  });

  it('strictly rejects ambiguous selectors matching multiple elements', async () => {
    const manager = new ObservationManager(1);

    const mockPage: any = {
      locator: (sel: string) => ({
        count: async () => 3, // multiple matches!
      }),
    };

    await expect(
      manager.resolveSelector(mockPage, '.btn-action')
    ).rejects.toThrow(ObservationResolutionError);

    try {
      await manager.resolveSelector(mockPage, '.btn-action');
    } catch (err: any) {
      expect(err.code).toBe('AMBIGUOUS_LOCATOR');
      expect(err.message).toContain('matched 3 elements');
      expect(err.message).toContain('Ambiguous entity targeting is prohibited');
    }
  });

  it('rejects nonexistent element selectors with NOT_FOUND', async () => {
    const manager = new ObservationManager(1);

    const mockPage: any = {
      locator: () => ({
        count: async () => 0,
      }),
    };

    await expect(
      manager.resolveSelector(mockPage, '#missing-item')
    ).rejects.toThrow(ObservationResolutionError);

    try {
      await manager.resolveSelector(mockPage, '#missing-item');
    } catch (err: any) {
      expect(err.code).toBe('NOT_FOUND');
    }
  });
});
