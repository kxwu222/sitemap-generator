import { useEffect, useRef, useState } from 'react';

interface ConnectionStyle {
  path?: 'straight' | 'elbow';
  dash?: 'solid' | 'dashed';
  color?: string;
}

interface ConnectionStylePopoverProps {
  linkKey: string;
  sourceId: string;    // NEW
  targetId: string;    // NEW
  currentStyle: ConnectionStyle;
  anchorPosition: { x: number; y: number };
  onChange: (linkKey: string, style: ConnectionStyle) => void;
  onDelete: (sourceId: string, targetId: string) => void;
  onClose: () => void;
}

export function ConnectionStylePopover({
  linkKey,
  sourceId,
  targetId,
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
const userMovedRef = useRef(false);
const [color, setColor] = useState<string>(currentStyle.color ?? '#111827');

// Neutral icon button (no active state styling, no circular border)
const iconBtnBase = 'w-9 h-9 flex items-center justify-center hover:bg-gray-50 rounded';

// Mini SVG line preview
const LineIcon = ({
  path = 'straight' as 'straight' | 'elbow',
  dash = 'solid' as 'solid' | 'dashed',
  color = '#111827',
  width = 2,
}) => {
  const W = 36, H = 20;
  const x1 = 4, y1 = H - 4, x2 = W - 4, y2 = 4;
  const dashArray = dash === 'dashed' ? '6,4' : undefined;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {path === 'straight' ? (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth={width}
              strokeDasharray={dashArray} strokeLinecap="round" />
      ) : (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y1}
                stroke={color} strokeWidth={width}
                strokeDasharray={dashArray} strokeLinecap="round" />
          <line x1={x2} y1={y1} x2={x2} y2={y2}
                stroke={color} strokeWidth={width}
                strokeDasharray={dashArray} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};

  useEffect(() => {
    if (userMovedRef.current) return; // NEW: skip recenter if user moved popover

    const h = popoverRef.current?.offsetHeight ?? 140;
    const viewportH = window.innerHeight;
    let finalY = anchorPosition.y;
    if (finalY - h / 2 < 10) finalY = h / 2 + 10;
    if (finalY + h / 2 > viewportH - 10) finalY = viewportH - h / 2 - 10;
    setPosition({ x: anchorPosition.x, y: finalY });
  }, [anchorPosition]); // keep dep, but honor userMovedRef

  const onMouseDownHeader = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    userMovedRef.current = true; // NEW
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

  // No Apply button; apply happens immediately on click.

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
            <div className="flex items-start gap-4">
              {/* Path group with title */}
              <div className="flex flex-col gap-1" role="group" aria-label="Path">
                <div className="text-xs text-gray-600 mb-1 font-medium">Path</div>
                <div className="flex gap-4">
                  <button
                    className={iconBtnBase}
                    aria-pressed={path === 'straight'}
                    title="Straight"
                    onClick={() => { setPath('straight'); onChange(linkKey, { path: 'straight', dash, color }); }}
                  >
                    <LineIcon path="straight" dash="solid" color={color} />
                  </button>
                  <button
                    className={iconBtnBase}
                    aria-pressed={path === 'elbow'}
                    title="Elbow"
                    onClick={() => { setPath('elbow'); onChange(linkKey, { path: 'elbow', dash, color }); }}
                  >
                    <LineIcon path="elbow" dash="solid" color={color} />
                  </button>
                </div>
              </div>
              {/* Divider */}
              <div className="h-14 w-px bg-gray-200" />
              {/* Line group with title */}
              <div className="flex flex-col gap-1" role="group" aria-label="Line">
                <div className="text-xs text-gray-600 mb-1 font-medium">Line</div>
                <div className="flex gap-4">
                  <button
                    className={iconBtnBase}
                    aria-pressed={dash === 'solid'}
                    title="Solid"
                    onClick={() => { setDash('solid'); onChange(linkKey, { path, dash: 'solid', color }); }}
                  >
                    <LineIcon path="straight" dash="solid" color={color} />
                  </button>
                  <button
                    className={iconBtnBase}
                    aria-pressed={dash === 'dashed'}
                    title="Dashed"
                    onClick={() => { setDash('dashed'); onChange(linkKey, { path, dash: 'dashed', color }); }}
                  >
                    <LineIcon path="straight" dash="dashed" color={color} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Color (moved after Line) */}
          <div>
            <div className="text-xs text-gray-600 mb-2 font-medium">Color</div>
            <div className="flex items-center gap-2">
              {['#111827','#6b7280','#3b82f6','#10b981','#f59e0b','#ef4444'].map((col) => (
                <button
                  key={col}
                  className={`w-6 h-6 rounded-full border ${color === col ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`}
                  style={{ backgroundColor: col }}
                  aria-pressed={color === col}
                  title={col}
                  onClick={() => { setColor(col); onChange(linkKey, { path, dash, color: col }); }}
                />
              ))}
              {/* Custom color picker trigger with overlaid input (prevents popover jumping) */}
              <button
                type="button"
                title="Custom color"
                className="relative w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
              >
                <img width="24" height="24" src="https://img.icons8.com/ios-glyphs/30/color-dropper.png" alt="color-dropper"/>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => { setColor(e.target.value); onChange(linkKey, { path, dash, color: e.target.value }); }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Choose custom color"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-xl">
          <button onClick={() => onDelete(sourceId, targetId)} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded">
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 rounded">Close</button>
          </div>
        </div>
      </div>
    </>
  );
}


