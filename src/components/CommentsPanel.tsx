import { useState, useRef, useEffect } from 'react';
import { MessageSquare, CheckCircle2, Circle, X, Filter } from 'lucide-react';
import { Comment } from '../types/comments';

interface CommentsPanelProps {
  comments: Comment[];
  filter: 'all' | 'unresolved' | 'resolved';
  onFilterChange: (filter: 'all' | 'unresolved' | 'resolved') => void;
  onCommentClick: (comment: Comment) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
  currentUserId?: string;
  isOwner?: boolean;
}

export function CommentsPanel({
  comments,
  filter,
  onFilterChange,
  onCommentClick,
  onResolve,
  onDelete,
  currentUserId,
  isOwner = false,
}: CommentsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  // Sort comments by creation date (newest first, like Miro)
  const sortedComments = [...comments].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // Newest first
  });

  const filteredComments = sortedComments.filter(comment => {
    if (filter === 'unresolved') return !comment.resolved;
    if (filter === 'resolved') return comment.resolved;
    return true;
  });

  const unresolvedCount = comments.filter(c => !c.resolved).length;
  const resolvedCount = comments.filter(c => c.resolved).length;

  const getFilterLabel = (filterValue: 'all' | 'unresolved' | 'resolved') => {
    switch (filterValue) {
      case 'all':
        return 'All';
      case 'unresolved':
        return 'Unresolved';
      case 'resolved':
        return 'Resolved';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border-t border-gray-200 flex flex-col flex-1 min-h-0">
      <div className="w-full pt-6 pb-3 px-6 flex items-center justify-between transition-colors flex-shrink-0">
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-900">
          Comments ({comments.length})
        </span>
      </div>

      {isExpanded && (
        <div className="px-6 pb-3 flex-shrink-0">
          {/* Filter button - pill shaped, smaller, under header */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-full text-xs font-medium transition-colors ${
                filter === 'all'
                  ? 'border border-gray-900 text-gray-900 hover:bg-orange-50'
                  : filter === 'unresolved'
                  ? 'border border-orange-600 text-orange-600 hover:bg-orange-50'
                  : 'border border-green-600 text-green-600 hover:bg-green-50'
              }`}
            >
              <Filter className={`w-3 h-3 ${filter === 'all' ? 'text-gray-900' : filter === 'unresolved' ? 'text-orange-600' : 'text-green-600'}`} strokeWidth={1.5} />
              <span>{getFilterLabel(filter)}</span>
            </button>
            
            {/* Dropdown with checkboxes */}
            {isFilterOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-[#B54407] rounded-lg shadow-lg z-50 min-w-[200px]">
                <div className="p-2">
                  {(['all', 'unresolved', 'resolved'] as const).map((filterValue) => {
                    const isSelected = filter === filterValue;
                    const getCount = () => {
                      switch (filterValue) {
                        case 'all':
                          return comments.length;
                        case 'unresolved':
                          return unresolvedCount;
                        case 'resolved':
                          return resolvedCount;
                      }
                    };
                    
                    return (
                      <label
                        key={filterValue}
                        className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-orange-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            onFilterChange(filterValue);
                            setIsFilterOpen(false);
                          }}
                          className="w-4 h-4 text-[#B54407] border-gray-300 rounded focus:ring-[#B54407] focus:ring-2"
                        />
                        <span className={`text-sm flex-1 ${isSelected ? 'text-[#B54407] font-medium' : 'text-gray-900'}`}>
                          {getFilterLabel(filterValue)}
                        </span>
                        <span className={`text-xs ${isSelected ? 'text-[#B54407]' : 'text-gray-500'}`}>
                          ({getCount()})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="px-6 pb-8 flex flex-col flex-1 min-h-0">
          {/* Comments list */}
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
            {filteredComments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No {filter === 'all' ? '' : filter} comments
              </p>
            ) : (
              filteredComments.map(comment => (
                <div
                  key={comment.id}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                    comment.resolved
                      ? 'bg-gray-50 border-gray-200 opacity-75'
                      : 'bg-white border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => onCommentClick(comment)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-900">
                          {comment.userName}
                        </span>
                        {comment.resolved && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" strokeWidth={2} />
                        )}
                        <span className="text-[10px] text-gray-500">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {comment.text || '(No text)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {(currentUserId === comment.userId || isOwner) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onResolve(comment.id, !comment.resolved);
                          }}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title={comment.resolved ? 'Unresolve' : 'Resolve'}
                        >
                          {comment.resolved ? (
                            <Circle className="w-4 h-4 text-gray-600" strokeWidth={2} />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-gray-600" strokeWidth={2} />
                          )}
                        </button>
                      )}
                      {(currentUserId === comment.userId || isOwner) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Delete immediately (no confirmation, consistent with node/text deletion)
                            onDelete(comment.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded transition-colors flex-shrink-0 z-10 relative"
                          title="Delete"
                          style={{ pointerEvents: 'auto' }}
                        >
                          <X className="w-3 h-3 text-red-500" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

