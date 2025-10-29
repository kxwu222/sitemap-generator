import { useEffect, useRef, useState } from 'react';

interface ConnectionStyle {
  path?: 'straight' | 'elbow';
  dash?: 'solid' | 'dashed';
}

interface ConnectionStylePopoverProps {
  linkKey: string; // `${sourceId}-${targetId}`
  currentStyle: ConnectionStyle;
  anchorPosition: { x: number; y: number };
  onChange: (linkKey: string, style: ConnectionStyle) => void;
  onDelete: (sourceId: string, targetId: string) => void;
  onClose: () => void;
}

export function ConnectionStylePopover({
  linkKey,
  currentStyle,
  anchorPosition,
  onChange,
  onDelete,
  onClose,
}: ConnectionStylePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchorPosition.x, y: anchorPosition.y });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [path, setPath] = useState<'straight' | 'elbow'>(currentStyle.path ?? 'straight');
  const [dash, setDash] = useState<'solid' | 'dashed'>(currentStyle.dash ?? 'solid');

  useEffect(() => {
    const h = popoverRef.current?.offsetHeight ?? 140;
    const viewportH = window.innerHeight;
    let finalY = anchorPosition.y;
    if (finalY - h / 2 < 10) finalY = h / 2 + 10;
    if (finalY + h / 2 > viewportH - 10) finalY = viewportH - h / 2 - 10;
    setPosition({ x: anchorPosition.x, y: finalY });
  }, [anchorPosition]);

  const onMouseDownHeader = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.preventDefault();
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const up = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      return () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
    }
  }, [isDragging, dragOffset]);

  const apply = () => onChange(linkKey, { path, dash });
  const [sourceId, targetId] = linkKey.split('-');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[250]" onClick={onClose} />

      <div
        ref={popoverRef}
        className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[251] w-[320px]"
        style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (draggable) */}
        <div className="px-4 py-3 border-b border-gray-100 cursor-move select-none flex items-center justify-between"
             onMouseDown={onMouseDownHeader}>
          <div className="text-sm font-semibold text-gray-900">Connection Style</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs text-gray-600 mb-2 font-medium">Path</div>
            <div className="flex gap-2">
              <button
                onClick={() => setPath('straight')}
                className={`px-2 py-1 text-xs rounded ${path === 'straight' ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-300 hover:bg-gray-50'}`}
              >Straight</button>
              <button
                onClick={() => setPath('elbow')}
                className={`px-2 py-1 text-xs rounded ${path === 'elbow' ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-300 hover:bg-gray-50'}`}
              >Elbow</button>
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-2 font-medium">Line</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDash('solid')}
                className={`px-2 py-1 text-xs rounded ${dash === 'solid' ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-300 hover:bg-gray-50'}`}
              >Solid</button>
              <button
                onClick={() => setDash('dashed')}
                className={`px-2 py-1 text-xs rounded ${dash === 'dashed' ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-300 hover:bg-gray-50'}`}
              >Dashed</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-xl">
          <button onClick={() => onDelete(sourceId, targetId)} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded">
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded">Close</button>
            <button onClick={apply} className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded">
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


