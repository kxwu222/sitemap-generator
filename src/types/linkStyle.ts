export type LineDash = 'solid' | 'dashed' | 'dotted';
export type LinkPath = 'straight' | 'elbow' | 'curved';
export type ArrowType = 'triangle' | 'vee';

export interface LinkStyle {
  dash?: LineDash;
  path?: LinkPath;
  width?: number;
  color?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  arrowType?: ArrowType;
  arrowSize?: number;
}

