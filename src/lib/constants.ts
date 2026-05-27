export const PARTS_LIST = ['도장PART', '가공PART', '제관(일반)', '제관(공구와기구)', '포장PART'] as const;
export type Part = typeof PARTS_LIST[number];
