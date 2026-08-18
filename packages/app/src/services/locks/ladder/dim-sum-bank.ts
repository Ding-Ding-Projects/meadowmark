/**
 * A small, self-contained, text-only bank of well-known dim sum dish
 * names, used ONLY to build the unlock ladder's first-rung trivia
 * question ("which dish is X?", four choices).
 *
 * This is intentionally independent of the app-wide dim-sum-surprise
 * feature and its public photo catalog (Ding-Ding-Projects/dim-sum-photos):
 * that feature shows a real photograph and is sourced strictly from the
 * public catalog release assets, never generated or vendored locally.
 * This module carries no images and makes no photographic or catalog
 * claim -- it is a short list of real, ordinary dish names used as plain
 * text trivia choices, the same way any general-knowledge quiz question
 * would name a real thing. If a future revision wants to align this list
 * with the public catalog's bilingual names for consistency, that is a
 * enhancement for whichever lane owns that catalog integration -- not a
 * requirement of the unlock ladder itself.
 */

export interface DimSumDish {
  id: string;
  english: string;
  cantonese: string;
  /** Romanization, shown alongside the Cantonese name so the prompt is
   * readable without assuming the reader can read Chinese characters. */
  jyutping: string;
}

export const DIM_SUM_DISHES: readonly DimSumDish[] = [
  { id: 'har-gow', english: 'Shrimp dumpling', cantonese: '蝦餃', jyutping: 'haa1 gaau2' },
  { id: 'siu-mai', english: 'Pork and shrimp dumpling', cantonese: '燒賣', jyutping: 'siu1 maai2' },
  { id: 'char-siu-bao', english: 'BBQ pork bun', cantonese: '叉燒包', jyutping: 'caa1 siu1 baau1' },
  { id: 'cheung-fun', english: 'Rice noodle roll', cantonese: '腸粉', jyutping: 'coeng2 fan2' },
  { id: 'egg-tart', english: 'Egg tart', cantonese: '蛋撻', jyutping: 'daan6 taat1' },
  { id: 'turnip-cake', english: 'Turnip cake', cantonese: '蘿蔔糕', jyutping: 'lo4 baak6 gou1' },
  { id: 'spring-roll', english: 'Spring roll', cantonese: '春卷', jyutping: 'ceon1 gyun2' },
  { id: 'chicken-feet', english: 'Phoenix claws (chicken feet)', cantonese: '鳳爪', jyutping: 'fung6 zaau2' },
  { id: 'lo-mai-gai', english: 'Sticky rice in lotus leaf', cantonese: '糯米雞', jyutping: 'no6 mai5 gai1' },
  { id: 'lai-wong-bao', english: 'Custard bun', cantonese: '奶皇包', jyutping: 'naai5 wong4 baau1' },
] as const;

if (DIM_SUM_DISHES.length < 4) {
  // Grading picks 1 correct + 3 distinct distractors; fewer than 4 dishes
  // would make that impossible. This can only fire if the bank above is
  // edited down accidentally.
  throw new Error('DIM_SUM_DISHES must have at least 4 entries.');
}

export function dishById(id: string): DimSumDish | undefined {
  return DIM_SUM_DISHES.find((dish) => dish.id === id);
}
