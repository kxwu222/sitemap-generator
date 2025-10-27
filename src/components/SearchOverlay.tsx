import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { PageNode } from '../utils/urlAnalyzer';

interface SearchOverlayProps {
  nodes: PageNode[];
  onSearchResults: (results: PageNode[]) => void;
  onClearSearch: () => void;
  isVisible: boolean;
  onClose: () => void;
  onFocusNode?: (node: PageNode) => void;
}

export function SearchOverlay({ nodes, onSearchResults, onClearSearch, isVisible, onClose, onFocusNode }: SearchOverlayProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PageNode[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      onClearSearch();
      return;
    }

    const results = nodes.filter(node => 
      node.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.url.toLowerCase().includes(searchTerm.toLowerCase())
    );

    setSearchResults(results);
    onSearchResults(results);
  }, [searchTerm, nodes, onSearchResults, onClearSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isVisible && inputRef.current && !inputRef.current.contains(event.target as Node)) {
        // Don't close if clicking on search results
        const searchResultsContainer = document.querySelector('.search-results-container');
        if (searchResultsContainer && searchResultsContainer.contains(event.target as Node)) {
          return;
        }
        handleClose();
      }
    };

    if (isVisible) {
      // Small delay to avoid immediate closing when opening
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isVisible, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && searchResults.length > 0) {
      // Focus on first result
      const firstResult = searchResults[0];
      if (firstResult && onFocusNode) {
        onFocusNode(firstResult);
        handleClose();
      }
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSearchResults([]);
    onClearSearch();
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div ref={inputRef} className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-[400px]">
      <div className="flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-500" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes by title or URL..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-900"
        />
        <button
          onClick={handleClose}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
        </button>
      </div>
      
      {searchResults.length > 0 && (
        <div className="mt-3 search-results-container">
          <div className="text-sm text-gray-600 mb-2">
            Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {searchResults.slice(0, 5).map((node, index) => (
              <div 
                key={node.id} 
                className="text-xs p-2 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => {
                  console.log('SearchOverlay: Clicked on node:', node.title, node.id);
                  console.log('SearchOverlay: onFocusNode function:', onFocusNode);
                  if (onFocusNode) {
                    console.log('SearchOverlay: Calling onFocusNode');
                    onFocusNode(node);
                    handleClose();
                  } else {
                    console.log('SearchOverlay: onFocusNode is not available');
                  }
                }}
              >
                <div className="font-medium text-gray-900 truncate">{node.title}</div>
                <div className="text-gray-500 truncate">{node.url}</div>
                <div className="text-gray-400 text-xs mt-1">Category: {node.category}</div>
              </div>
            ))}
            {searchResults.length > 5 && (
              <div className="text-xs text-gray-500 text-center py-1">
                ... and {searchResults.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
      
      {searchTerm && searchResults.length === 0 && (
        <div className="mt-3 text-sm text-gray-500">
          No results found for "{searchTerm}"
        </div>
      )}
    </div>
  );
}
