import { useState, useEffect, useRef } from 'react';

interface LinkEditorPopoverProps {
  nodeId: string;
  currentUrl: string;
  anchorPosition: { x: number; y: number };
  onSave: (nodeId: string, url: string) => void;
  onClose: () => void;
}

export function LinkEditorPopover({ nodeId, currentUrl, anchorPosition, onSave, onClose }: LinkEditorPopoverProps) {
  const [url, setUrl] = useState(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isValid, setIsValid] = useState(true);
  const [isTested, setIsTested] = useState(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const validateUrl = (urlValue: string) => {
    if (!urlValue.trim()) {
      setIsValid(true);
      return true;
    }
    
    try {
      new URL(urlValue);
      setIsValid(true);
      return true;
    } catch {
      if (urlValue.startsWith('www.') || urlValue.includes('.') || urlValue.startsWith('/')) {
        setIsValid(true);
        return true;
      }
      setIsValid(false);
      return false;
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    validateUrl(newUrl);
    setIsTested(false);
  };

  const handleSave = () => {
    if (isValid && url.trim()) {
      onSave(nodeId, url.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleTestLink = async () => {
    if (!url || !isValid) return;
    setIsTested(true);
    const urlToOpen = url.startsWith('http') ? url : `https://${url}`;
    try {
      const response = await fetch(urlToOpen, { method: 'HEAD', mode: 'no-cors' });
      // If we get here, the URL is reachable (in no-cors mode)
    } catch (error) {
      // URL might not be reachable but that's okay
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
  };

  const handleOpenLink = () => {
    if (url) {
      const urlToOpen = url.startsWith('http') ? url : `https://${url}`;
      window.open(urlToOpen, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[250]" onClick={onClose} />

      <div
        className="fixed bg-white border border-gray-200 rounded-xl shadow-xl z-[251] w-[420px]"
        style={{
          left: `${anchorPosition.x}px`,
          top: `${anchorPosition.y}px`,
          transform: 'translate(-50%, 8px)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Edit Link</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="pt-5 pb-2 px-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
              URL
            </label>
            <div className="relative flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={handleUrlChange}
                onKeyDown={handleKeyDown}
                className={`flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all font-mono ${
                  isValid 
                    ? 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20' 
                    : 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                }`}
                placeholder="https://example.com/page"
              />
              <button
                onClick={handleCopyLink}
                className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-lg transition-all"
                title="Copy URL"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
            {!isValid && url && (
              <div className="text-xs text-red-600 flex items-center gap-1 mt-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Invalid URL format
              </div>
            )}
          </div>

          {/* Quick Actions - Cleaner */}
          {/* Small Open button */}
          {url && (
            <div className="flex justify-start">
              <button
                onClick={handleOpenLink}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5"
                title="Open link in new tab"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-200 flex justify-end gap-2 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || !url.trim()}
            className="px-5 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save
          </button>
        </div>
      </div>
    </>
  );
}

