import type { Lick } from './types';

const modules = import.meta.glob<Lick>('./*.json', { eager: true, import: 'default' });

export const LICKS: Lick[] = Object.values(modules).sort(
  (a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name),
);

export function lickById(id: string): Lick | undefined {
  return LICKS.find((lick) => lick.id === id);
}

export * from './types';
