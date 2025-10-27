import { useState, useEffect, useRef } from 'react';

interface TitleEditorPopoverProps {
  nodeId: string;
  currentTitle: string;
  anchorPosition: { x: number; y: number };
  onSave: (nodeId: string, title: string) => void;
  onClose: () => void;
}

export function TitleEditorPopover({ nodeId, currentTitle, anchorPosition, onSave, onClose }: TitleEditorPopoverProps) {
  const [title, setTitle] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSave = () => {
    if (title.trim()) {
      onSave(nodeId, title.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[250]"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        className="fixed bg-white border border-gray-300 rounded-lg shadow-xl z-[251] w-80"
        style={{
          left: `${anchorPosition.x}px`,
          top: `${anchorPosition.y}px`,
          transform: 'translate(-50%, 8px)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900">Edit Title</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Page Title
            </label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter page title"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

