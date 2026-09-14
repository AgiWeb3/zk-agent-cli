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
          'Start with setup first. This environment is still at the first local step.'
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
          'Local defaults are ready, but wallet creation is still the next required step.'
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
            ? 'Local readiness is clear. Return to zk-agent next for the live path.'
            : 'The default next step is the flagship workflow pay path. Switch to suite only when the question is broader than one pay step.')
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
          'A stored workflow is already active. Stay on workflow follow-up until that question is done.'
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
