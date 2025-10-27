import { useState, useEffect, useRef } from 'react';
import { PageNode } from '../utils/urlAnalyzer';

interface ColorPickerPopoverProps {
  nodeIds: string[];
  allNodes: PageNode[];
  anchorPosition: { x: number; y: number };
  onColorChange: (nodeIds: string[], bgColor: string, textColor: string) => void;
  onClose: (applied?: boolean) => void;
  onPreview?: (nodeIds: string[], bgColor: string, textColor: string) => void;
}

// Compact preset colors - 12 most common colors
const PRESET_COLORS = [
  { bg: '#ffffff', text: '#000000', name: 'White' },
  { bg: '#e5e7eb', text: '#1f2937', name: 'Gray' },
  { bg: '#dbeafe', text: '#1e40af', name: 'Light Blue' },
  { bg: '#3b82f6', text: '#ffffff', name: 'Blue' },
  { bg: '#d1fae5', text: '#065f46', name: 'Light Green' },
  { bg: '#10b981', text: '#ffffff', name: 'Green' },
  { bg: '#fef3c7', text: '#92400e', name: 'Light Yellow' },
  { bg: '#f59e0b', text: '#ffffff', name: 'Orange' },
  { bg: '#fee2e2', text: '#991b1b', name: 'Light Red' },
  { bg: '#ef4444', text: '#ffffff', name: 'Red' },
  { bg: '#f3e8ff', text: '#6b21a8', name: 'Light Purple' },
  { bg: '#a855f7', text: '#ffffff', name: 'Purple' },
];

export function ColorPickerPopover({
  nodeIds,
  allNodes,
  anchorPosition,
  onColorChange,
  onClose,
  onPreview,
}: ColorPickerPopoverProps) {
  const isSingleNode = nodeIds.length === 1;
  const firstNode = isSingleNode ? allNodes.find(n => n.id === nodeIds[0]) : null;
  
  const [bgColor, setBgColor] = useState(firstNode?.customColor || '#ffffff');
  const [textColor, setTextColor] = useState(firstNode?.textColor || '#000000');
  const [applyToGroup, setApplyToGroup] = useState(false);
  // When cancelling, suppress any further preview updates before unmount
  const isCancellingRef = useRef(false);
  
  // Smart positioning to avoid cropping
  const [position, setPosition] = useState({ x: anchorPosition.x, y: anchorPosition.y, placement: 'right' as 'top' | 'bottom' | 'left' | 'right' });
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // Draggable state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Get all nodes in the same category as the first selected node
  const categoryNodes = firstNode
    ? allNodes.filter(n => n.category === firstNode.category)
    : [];
  const showGroupOption = isSingleNode && categoryNodes.length > 1;

  // Smart positioning based on viewport - default to right of node
  useEffect(() => {
    if (popoverRef.current) {
      const popoverHeight = popoverRef.current.offsetHeight;
      const popoverWidth = 360; // w-[360px]
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Check available space in all directions
      const spaceRight = viewportWidth - anchorPosition.x;
      const spaceLeft = anchorPosition.x;
      const spaceBelow = viewportHeight - anchorPosition.y;
      
      // Default to right placement
      let finalX = anchorPosition.x;
      let finalY = anchorPosition.y;
      let placement: 'top' | 'bottom' | 'left' | 'right' = 'right';
      
      // Determine best placement based on available space
      if (spaceRight >= popoverWidth + 20) {
        // Enough space on right (preferred)
        placement = 'right';
        finalX = anchorPosition.x;
        finalY = anchorPosition.y;
        // Adjust Y to keep within viewport
        if (finalY - popoverHeight / 2 < 10) {
          finalY = popoverHeight / 2 + 10;
        } else if (finalY + popoverHeight / 2 > viewportHeight - 10) {
          finalY = viewportHeight - popoverHeight / 2 - 10;
        }
      } else if (spaceLeft >= popoverWidth + 20) {
        // Not enough space on right, try left
        placement = 'left';
        finalX = anchorPosition.x;
        finalY = anchorPosition.y;
        // Adjust Y to keep within viewport
        if (finalY - popoverHeight / 2 < 10) {
          finalY = popoverHeight / 2 + 10;
        } else if (finalY + popoverHeight / 2 > viewportHeight - 10) {
          finalY = viewportHeight - popoverHeight / 2 - 10;
        }
      } else if (spaceBelow >= popoverHeight + 20) {
        // Not enough horizontal space, try below
        placement = 'bottom';
        finalX = anchorPosition.x;
        finalY = anchorPosition.y;
        // Adjust X to keep within viewport
        if (finalX - popoverWidth / 2 < 10) {
          finalX = popoverWidth / 2 + 10;
        } else if (finalX + popoverWidth / 2 > viewportWidth - 10) {
          finalX = viewportWidth - popoverWidth / 2 - 10;
        }
      } else {
        // Last resort: above
        placement = 'top';
        finalX = anchorPosition.x;
        finalY = anchorPosition.y;
        // Adjust X to keep within viewport
        if (finalX - popoverWidth / 2 < 10) {
          finalX = popoverWidth / 2 + 10;
        } else if (finalX + popoverWidth / 2 > viewportWidth - 10) {
          finalX = viewportWidth - popoverWidth / 2 - 10;
        }
      }
      
      setPosition({ x: finalX, y: finalY, placement });
    }
  }, [anchorPosition]);

  // Real-time preview when colors change
  useEffect(() => {
    if (onPreview && !isCancellingRef.current) {
      const targetIds = applyToGroup && firstNode
        ? categoryNodes.map(n => n.id)
        : nodeIds;
      onPreview(targetIds, bgColor, textColor);
    }
  }, [bgColor, textColor, applyToGroup, nodeIds, firstNode, categoryNodes, onPreview]);

  const handlePresetClick = (preset: typeof PRESET_COLORS[0]) => {
    setBgColor(preset.bg);
    setTextColor(preset.text);
    // Trigger immediate preview
    if (onPreview) {
      const targetIds = applyToGroup && firstNode
        ? categoryNodes.map(n => n.id)
        : nodeIds;
      onPreview(targetIds, preset.bg, preset.text);
    }
  };

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      const rect = popoverRef.current?.getBoundingClientRect();
      if (rect) {
        // Store the offset from mouse position to popover's current position
        setDragOffset({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      }
      e.preventDefault();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Calculate new position based on mouse movement minus the initial offset
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        setPosition(prev => ({
          ...prev,
          x: newX,
          y: newY,
        }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const handleApply = () => {
    const targetIds = applyToGroup && firstNode
      ? categoryNodes.map(n => n.id)
      : nodeIds;
    onColorChange(targetIds, bgColor, textColor);
    onClose(true); // Pass true to indicate color was applied
  };

  const handleCancel = () => {
    // Close without applying - parent will restore original colors.
    // Prevent any final preview from firing before unmount.
    isCancellingRef.current = true;
    onClose(false); // Pass false to indicate color was not applied
  };

  const getTransform = () => {
    if (position.placement === 'top') {
      return 'translate(-50%, calc(-100% - 8px))';
    } else if (position.placement === 'right') {
      return 'translate(8px, -50%)';
    } else if (position.placement === 'left') {
      return 'translate(calc(-100% - 8px), -50%)';
    }
    return 'translate(-50%, 8px)';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[250]"
        onClick={() => onClose(false)}
      />

      {/* Popover - Compact version with smart positioning */}
      <div
        ref={popoverRef}
        className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[251] w-[360px] max-h-[85vh] overflow-y-auto"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: getTransform(),
        }}
      >
        {/* Header - Draggable */}
        <div 
          className="px-5 py-4 border-b border-gray-100 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            <h3 className="text-base font-semibold text-gray-900">
              Change Color
            </h3>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 ml-auto">
              <circle cx="9" cy="5" r="1" />
              <circle cx="9" cy="12" r="1" />
              <circle cx="9" cy="19" r="1" />
              <circle cx="15" cy="5" r="1" />
              <circle cx="15" cy="12" r="1" />
              <circle cx="15" cy="19" r="1" />
            </svg>
          </div>
          {nodeIds.length > 1 && (
            <p className="text-xs text-gray-500 mt-1 ml-7">{nodeIds.length} nodes selected</p>
          )}
        </div>

        {/* Content - Compact Layout */}
        <div className="p-4 space-y-4">
          {/* Preset Colors - 4 columns for compactness */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2.5">
              Preset Colors
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePresetClick(preset)}
                  className="h-6 w-9 rounded-lg hover:scale-105 transition-all duration-200 items-center justify-center text-xs font-bold shadow-sm hover:shadow-md"
                  style={{
                    backgroundColor: preset.bg,
                    color: preset.text,
                    border: bgColor === preset.bg && textColor === preset.text ? '2.5px solid #3b82f6' : '1px solid #e5e7eb',
                    outline: bgColor === preset.bg && textColor === preset.text ? '2px solid #93c5fd' : 'none',
                    outlineOffset: '1px',
                  }}
                  title={preset.name}
                >
                  A
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors - Stacked layout for better fit */}
          <div className="space-y-3">
            {/* Background Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer flex-shrink-0"
                  style={{ padding: '2px' }}
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            {/* Text Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Text
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer flex-shrink-0"
                  style={{ padding: '2px' }}
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          {/* Group Application Option */}
          {showGroupOption && firstNode && (
            <div className="pt-3 border-t border-gray-200">
              <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-2.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={applyToGroup}
                  onChange={(e) => setApplyToGroup(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                />
                <span className="leading-tight">Apply to all <strong className="font-semibold">{categoryNodes.length}</strong> in <strong className="font-semibold">"{firstNode.category}"</strong></span>
              </label>
            </div>
          )}
        </div>

        {/* Footer - Compact */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-xl">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

