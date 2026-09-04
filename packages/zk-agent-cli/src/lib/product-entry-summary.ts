import type { OnboardingStage } from './onboarding-summary.js';

export type ProductEntryCategory = 'bootstrap' | 'recover' | 'operate' | 'workflow';
export type ProductEntryMode = 'local-first' | 'hosted-recovery' | 'workflow-followup';
export type ProductEntrySurface = 'next' | 'setup' | 'wallet' | 'workflow' | 'suite';
export type ProductEntryCurrentSurface = 'next' | 'doctor';

export interface ProductEntrySummary {
  view: 'product-entry';
  currentSurface: ProductEntryCurrentSurface;
  stage: OnboardingStage;
  category: ProductEntryCategory;
  recommendedMode: ProductEntryMode;
  nextSurface: ProductEntrySurface;
  nextAction: string | null;
  suiteAvailable: boolean;
  note: string;
}

export function buildProductEntrySummary(input: {
  currentSurface?: ProductEntryCurrentSurface;
  stage: OnboardingStage;
  nextAction?: string | null;
  suiteAvailable?: boolean;
  nextSurface?: ProductEntrySurface;
  note?: string;
}): ProductEntrySummary {
  const currentSurface = input.currentSurface ?? 'next';
  switch (input.stage) {
    case 'setup':
      return {
        view: 'product-entry',
        currentSurface,
        stage: input.stage,
        category: 'bootstrap',
        recommendedMode: 'local-first',
        nextSurface: input.nextSurface ?? 'setup',
        nextAction: input.nextAction ?? null,
        suiteAvailable: false,
        note:
          input.note ??
          'Start with setup first. The operator path is still in first-run bootstrap.'
      };
    case 'wallet-bootstrap':
      return {
        view: 'product-entry',
        currentSurface,
        stage: input.stage,
        category: 'bootstrap',
        recommendedMode: 'local-first',
        nextSurface: input.nextSurface ?? 'wallet',
        nextAction: input.nextAction ?? null,
        suiteAvailable: false,
        note:
          input.note ??
          'Local defaults exist, but wallet bootstrap is still the current product question.'
      };
    case 'wallet-recovery':
      return {
        view: 'product-entry',
        currentSurface,
        stage: input.stage,
        category: 'recover',
        recommendedMode: 'local-first',
        nextSurface: input.nextSurface ?? 'wallet',
        nextAction: input.nextAction ?? null,
        suiteAvailable: false,
        note:
          input.note ??
          'Stay on wallet recovery until approval or local signer readiness stops being the blocker.'
      };
    case 'wallet-ready':
      return {
        view: 'product-entry',
        currentSurface,
        stage: input.stage,
        category: 'operate',
        recommendedMode: 'local-first',
        nextSurface: input.nextSurface ?? (currentSurface === 'doctor' ? 'next' : 'workflow'),
        nextAction: input.nextAction ?? null,
        suiteAvailable: input.suiteAvailable === true,
        note:
          input.note ??
          (currentSurface === 'doctor'
            ? 'Local readiness is clear. Return to zk-agent next when you want the live operator path instead of a local-only diagnosis.'
            : 'The default product action is now the flagship workflow path. Switch to suite when the question becomes broader than one flagship pay step.')
      };
    case 'workflow':
      return {
        view: 'product-entry',
        currentSurface,
        stage: input.stage,
        category: 'workflow',
        recommendedMode: 'workflow-followup',
        nextSurface: input.nextSurface ?? 'workflow',
        nextAction: input.nextAction ?? null,
        suiteAvailable: input.suiteAvailable === true,
        note:
          input.note ??
          'A stored workflow checkpoint is now the active product context. Stay on workflow follow-up until the question is no longer workflow-specific.'
      };
    default: {
      const exhaustive: never = input.stage;
      throw new Error(`Unsupported product entry stage: ${String(exhaustive)}`);
    }
  }
}

export function productEntrySummaryLines(
  summary: ProductEntrySummary
): Array<[string, string]> {
  return [
    ['entry view', summary.view],
    ['entry category', summary.category],
    ['recommended mode', summary.recommendedMode],
    ['next surface', summary.nextSurface],
    ['suite available', summary.suiteAvailable ? 'yes' : 'no'],
    ['entry note', summary.note]
  ];
}
