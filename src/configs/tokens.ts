export const colorTokens = {
  // Neutral
  'Neutral/0': '#000000',
  'Neutral/10': '#16171A',
  'Neutral/20': '#292C33',
  'Neutral/30': '#3E464D',
  'Neutral/40': '#525D66',
  'Neutral/50': '#667480',
  'Neutral/60': '#849099',
  'Neutral/70': '#9AA8B2',
  'Neutral/80': '#B8C3CC',
  'Neutral/90': '#DFE1E5',
  'Neutral/92': '#E1E5EB',
  'Neutral/94': '#E6EAF0',
  'Neutral/96': '#EDF1F5',
  'Neutral/97': '#F2F5F7',
  'Neutral/98': '#F6F9FB',
  'Neutral/100': '#FFFFFF',

  // Theme (brand green)
  'Theme/1': '#12B89A',
  'Theme/2': '#2CCAAD',
  'Theme/3': '#94DFD2',
  'Theme/4': '#B8EAE1',
  'Theme/5': '#DCF2EF',
  'Theme/6': '#F0FCFA',
  'Theme/Color': '#F0F9F7',

  // Auxiliary / Blue
  'Auxiliary/Blue/1': '#1677F9',
  'Auxiliary/Blue/2': '#67A4FB',
  'Auxiliary/Blue/3': '#AFCFF8',
  'Auxiliary/Blue/4': '#D6E7FC',
  'Auxiliary/Blue/5': '#EBF3FF',

  // Auxiliary / Red
  'Auxiliary/Red/1': '#FF4E4D',
  'Auxiliary/Red/2': '#FF7775',
  'Auxiliary/Red/3': '#FFCDCC',
  'Auxiliary/Red/4': '#FFE5E5',
  'Auxiliary/Red/5': '#FFF2F2',
  'Auxiliary/Red/6': '#A5002C',

  // Auxiliary / Yellow
  'Auxiliary/Yellow/1': '#FA9A0B',
  'Auxiliary/Yellow/2': '#FFBD5B',
  'Auxiliary/Yellow/3': '#FFD699',
  'Auxiliary/Yellow/4': '#FFEDD4',
  'Auxiliary/Yellow/5': '#FFF7EB',
} as const

export type ColorToken = keyof typeof colorTokens

export function token(name: ColorToken): string {
  return colorTokens[name]
}
