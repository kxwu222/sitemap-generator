export type FigureType = 'text' | 'rect' | 'ellipse' | 'square' | 'circle';

export interface Figure {
  id: string;
  type: FigureType;
  x: number;
  y: number;
  width?: number;   // for rect/ellipse/square/circle
  height?: number;  // for rect/ellipse/square/circle
  text?: string;    // for text or text inside shapes
  fill?: string;     // background color
  stroke?: string;   // border color
  textColor?: string;
  // Text styling
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  underline?: boolean;
  // Shape styling
  strokeWidth?: number; // border thickness for shapes
}

export type LineDash = 'solid' | 'dashed';
export type LinePath = 'straight' | 'elbow';

export interface FreeLine {
  id: string;
  // Endpoints in canvas coords
  x1: number; y1: number;
  x2: number; y2: number;
  // Optional anchors to nodes; if present, endpoints follow node positions
  startNodeId?: string;
  endNodeId?: string;
  
  style: {
    path: LinePath;
    dash: LineDash;
    width: number;
    color: string;
    arrowStart?: boolean;
    arrowEnd?: boolean;
  };
}
