import type { SequenceInput } from '../types';
import { proteinToDna } from '../utils/translation.ts';

const seed =
  'MKTAYIAKQRQISFVKSHFSRQDILDLWIYHTQGYFPDWQNYGPGTSVAVQAGYAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR';

function setResidues(sequence: string, residues: Record<number, string>): string {
  const chars = [...sequence];
  for (const [position, residue] of Object.entries(residues)) {
    chars[Number(position) - 1] = residue;
  }
  return chars.join('');
}

function mutate(sequence: string, residues: Record<number, string>): string {
  return setResidues(sequence, residues);
}

export const sampleTemplateProtein = setResidues(seed.repeat(3).slice(0, 330), {
  1: 'M',
  125: 'I',
  150: 'K',
  188: 'D',
  309: 'Y',
});

export const sampleTemplateDna = `${proteinToDna(sampleTemplateProtein)}TAA`;

export const sampleQueries: SequenceInput[] = [
  {
    id: 'sample-f2',
    name: 'F2',
    sequence: mutate(sampleTemplateProtein, { 150: 'R' }),
  },
  {
    id: 'sample-f3',
    name: 'F3',
    sequence: mutate(sampleTemplateProtein, { 125: 'V', 188: 'G' }),
  },
];

export const sampleBlastxQueries: SequenceInput[] = [
  {
    id: 'sample-x-f2',
    name: 'F2',
    sequence: `${proteinToDna(mutate(sampleTemplateProtein, { 150: 'R' }))}TAA`,
  },
  {
    id: 'sample-x-f3',
    name: 'F3',
    sequence: `${proteinToDna(mutate(sampleTemplateProtein, { 125: 'V', 188: 'G' }))}TAA`,
  },
];
