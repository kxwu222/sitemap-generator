export type FigureType = 'text' | 'rect' | 'ellipse';

export interface Figure {
  id: string;
  type: FigureType;
  x: number;
  y: number;
  width?: number;   // for rect/ellipse
  height?: number;  // for rect/ellipse
  text?: string;    // for text or text inside shapes
  fill?: string;     // background color
  stroke?: string;   // border color
  textColor?: string;
  // Text styling
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  underline?: boolean;
}

export type LineDash = 'solid' | 'dashed';
export type LinePath = 'straight' | 'elbow';

export interface FreeLine {
  id: string;
  // Endpoints in canvas coords
  x1: number; y1: number;
  x2: number; y2: number;
  
  style: {
    path: LinePath;
    dash: LineDash;
    width: number;
    color: string;
    arrowStart?: boolean;
    arrowEnd?: boolean;
  };
}
