import { PageNode } from '../utils/urlAnalyzer';

interface HoverToolbarProps {
  node: PageNode;
  position: { x: number; y: number };
  onAddChild: (nodeId: string) => void;
  onColorClick: (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onLinkClick: (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HoverToolbar({ node, position, onAddChild, onColorClick, onLinkClick, onMouseEnter, onMouseLeave }: HoverToolbarProps) {
  return (
    <div
      className="fixed flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-lg px-1.5 py-1.5 z-40 transition-opacity duration-150"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, calc(-100% - 10px))',
        pointerEvents: 'none',
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        // Keep toolbar visible when mouse enters
        if (onMouseEnter) {
          onMouseEnter();
        }
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        // Start grace period when mouse leaves toolbar
        if (onMouseLeave) {
          onMouseLeave();
        }
      }}
    >
      {/* Add Node Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddChild(node.id);
        }}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
        style={{ pointerEvents: 'auto' }}
        title="Add new node"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Add Node (A)
        </span>
      </button>

        {/* Color Button */}
      <button
        onClick={(e) => {
            e.stopPropagation();
          onColorClick(node.id, e);
        }}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
        style={{ pointerEvents: 'auto' }}
        title="Change color"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="text-gray-700" viewBox="0 0 16 16">
          <path d="M15.825.12a.5.5 0 0 1 .132.584c-1.53 3.43-4.743 8.17-7.095 10.64a6.1 6.1 0 0 1-2.373 1.534c-.018.227-.06.538-.16.868-.201.659-.667 1.479-1.708 1.74a8.1 8.1 0 0 1-3.078.132 4 4 0 0 1-.562-.135 1.4 1.4 0 0 1-.466-.247.7.7 0 0 1-.204-.288.62.62 0 0 1 .004-.443c.095-.245.316-.38.461-.452.394-.197.625-.453.867-.826.095-.144.184-.297.287-.472l.117-.198c.151-.255.326-.54.546-.848.528-.739 1.201-.925 1.746-.896q.19.012.348.048c.062-.172.142-.38.238-.608.261-.619.658-1.419 1.187-2.069 2.176-2.67 6.18-6.206 9.117-8.104a.5.5 0 0 1 .596.04M4.705 11.912a1.2 1.2 0 0 0-.419-.1c-.246-.013-.573.05-.879.479-.197.275-.355.532-.5.777l-.105.177c-.106.181-.213.362-.32.528a3.4 3.4 0 0 1-.76.861c.69.112 1.736.111 2.657-.12.559-.139.843-.569.993-1.06a3 3 0 0 0 .126-.75zm1.44.026c.12-.04.277-.1.458-.183a5.1 5.1 0 0 0 1.535-1.1c1.9-1.996 4.412-5.57 6.052-8.631-2.59 1.927-5.566 4.66-7.302 6.792-.442.543-.795 1.243-1.042 1.826-.121.288-.214.54-.275.72v.001l.575.575zm-4.973 3.04.007-.005zm3.582-3.043.002.001h-.002z"/>
        </svg>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Color (C)
        </span>
      </button>

      {/* Link Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLinkClick(node.id, e);
        }}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
        style={{ pointerEvents: 'auto' }}
        title="Edit link"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Link (Ctrl/Cmd + L)
        </span>
      </button>
    </div>
  );
}

