export type Evidence = {
  time: string;
  title: string;
  observation: string;
  correction: string;
};

export type Report = {
  mode: 'real' | 'demo';
  provider: string;
  usedInReport: boolean;
  summary: string;
  strengths: string[];
  priorities: string[];
  opponent: string[];
  plan: string[];
  drills: string[];
  evidence: Evidence[];
};

export type FighterDescriptor = {
  preset?: 'red_gloves' | 'blue_gloves';
  glove_color?: 'red' | 'blue' | '';
  top_color?: string;
  relative_height?: 'shorter' | 'similar' | 'taller';
  build?: 'lean' | 'average' | 'stocky';
  stance?: 'orthodox' | 'southpaw' | 'switch';
  anchor_x?: number;
  anchor_y?: number;
  description?: string;
};

export type AnalysisInput = {
  language: 'es' | 'en';
  review_focus: string;
  intensity: string;
  sport: 'boxing' | 'kickboxing';
  stance: 'orthodox' | 'southpaw' | 'switch';
  athlete_marker: string;
  glove_color: string;
  top_color: string;
  relative_height: string;
  build: string;
  fighter_description: string;
  fighter_anchor_x: string;
  fighter_anchor_y: string;
};

export type SessionRecord = {
  id: string;
  createdAt: number;
  video: {
    name: string;
    size: number;
    type: string;
  };
  input: AnalysisInput & {
    fighterDescriptor: FighterDescriptor;
  };
  report: Report | null;
  status: 'completed' | 'failed';
  error?: string;
};

export type UserPreferences = {
  language: 'es' | 'en';
  sport: 'boxing' | 'kickboxing';
  stance: 'orthodox' | 'southpaw' | 'switch';
  review_focus: string;
  intensity: string;
  // Extended profile fields
  userName: string;
  weightClass: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'pro';
  primaryGoal: 'technique' | 'fitness' | 'competition' | 'self_defense';
  trainingFrequency: '1-2' | '3-4' | '5+' | 'irregular';
  preferredCoachStyle: 'analytical' | 'motivational' | 'direct' | 'balanced';
  notificationsEnabled: boolean;
  autoSaveReports: boolean;
  dataSharingConsent: boolean;
};

export const defaultPreferences: UserPreferences = {
  language: 'es',
  sport: 'boxing',
  stance: 'orthodox',
  review_focus: 'full',
  intensity: 'moderate',
  userName: '',
  weightClass: '',
  experienceLevel: 'beginner',
  primaryGoal: 'technique',
  trainingFrequency: '3-4',
  preferredCoachStyle: 'balanced',
  notificationsEnabled: true,
  autoSaveReports: true,
  dataSharingConsent: false,
};