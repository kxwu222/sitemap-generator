import { useState, useRef, useEffect } from 'react';
import { Comment } from '../types/comments';

interface CommentBubbleProps {
  comment: Comment;
  transform: { x: number; y: number; scale: number };
  isEditing: boolean;
  onStartEdit: () => void;
  onFinishEdit: (text: string) => void;
  onMove: (x: number, y: number) => void;
  onDelete?: () => void;
  currentUserId?: string;
  isOwner?: boolean;
}

export function CommentBubble({
  comment,
  transform,
  isEditing,
  onStartEdit,
  onFinishEdit,
  onMove,
  onDelete,
  currentUserId,
  isOwner = false,
}: CommentBubbleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [localText, setLocalText] = useState(comment.text);
  const [isExpanded, setIsExpanded] = useState(isEditing || (comment.text && comment.text.trim().length > 0));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Update local text and expanded state when comment changes
  useEffect(() => {
    setLocalText(comment.text);
    // Update expanded state based on whether comment has text
    if (!isEditing) {
      setIsExpanded(comment.text && comment.text.trim().length > 0);
    }
  }, [comment.text, isEditing]);

  // Auto-focus and expand when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      setIsExpanded(true);
    }
  }, [isEditing]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localText, isEditing]);

  const [screenPos, setScreenPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firstChar = comment.userEmail?.[0]?.toUpperCase() || '?';

  // Find canvas element once on mount
  useEffect(() => {
    canvasRef.current = document.querySelector('canvas');
  }, []);

  // Update position when transform or comment position changes (like text figures)
  // Use entire transform object as dependency to ensure updates on any transform change
  useEffect(() => {
    const updatePosition = () => {
      // Calculate position relative to the comments container (which is absolute inset-0 relative to canvas container)
      // The comments container is positioned at (0, 0) relative to the canvas container
      // So we need to calculate position relative to the canvas container, not the viewport
      // Position = transform offset + scaled canvas coordinates
      setScreenPos({
        x: transform.x + comment.x * transform.scale,
        y: transform.y + comment.y * transform.scale,
      });
    };

    // Update immediately
    updatePosition();
    
    // Also update on next animation frame for smoother updates during zoom
    const rafId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(rafId);
  }, [transform, comment.x, comment.y]); // Use entire transform object

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return; // Don't drag while editing
    
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const canvasDx = dx / transform.scale;
    const canvasDy = dy / transform.scale;

    const newX = comment.x + canvasDx;
    const newY = comment.y + canvasDy;
    onMove(newX, newY);

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, comment.x, comment.y, transform.scale]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      setIsExpanded(true);
      onStartEdit();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setLocalText(comment.text); // Revert changes
      handleFinishEdit();
    }
  };

  const handleFinishEdit = () => {
    onFinishEdit(localText);
    // Always collapse when editing finishes (clicking background)
    setIsExpanded(false);
  };

  const handleBlur = () => {
    // Delay to allow click events to process
    setTimeout(() => {
      handleFinishEdit();
    }, 200);
  };

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleDateString();
  };

  const canDelete = currentUserId === comment.userId || isOwner;

  // Collapsed state: small blue bubble with first character
  if (!isExpanded && !isEditing) {
    // Use a less aggressive scaling formula to prevent bubbles from being too small/large
    // Square root makes the scaling smoother and less extreme
    const scaleFactor = Math.sqrt(1 / transform.scale);
    // Clamp to reasonable bounds (between 0.6x and 1.6x) to prevent extreme sizes
    const clampedScale = Math.max(1, Math.min(1.1, scaleFactor));
    
    return (
      <div
        ref={bubbleRef}
        className="absolute z-40 cursor-move pointer-events-auto"
        style={{
          left: screenPos.x,
          top: screenPos.y,
          transform: `translate(-50%, -50%) scale(${clampedScale})`,
          transformOrigin: 'center center',
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium shadow-md hover:bg-blue-600 transition-colors">
          {firstChar}
        </div>
      </div>
    );
  }

  // Expanded state: full chat bubble
  return (
    <div
      ref={bubbleRef}
      className="absolute z-40 pointer-events-auto"
      style={{
        left: screenPos.x,
        top: screenPos.y - 100, // Position above anchor point (constant screen offset)
        transform: 'translate(-50%, 0)',
        minWidth: '200px',
        maxWidth: '400px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`bg-white rounded-lg shadow-md border border-gray-200 ${
          isDragging ? 'cursor-move' : ''
        }`}
        onMouseDown={(e) => {
          // Don't handle drag if clicking on delete button or any button
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.tagName === 'BUTTON') {
            return;
          }
          handleMouseDown(e);
        }}
        style={{
          position: 'relative',
        }}
      >
        {/* Tail pointing down to anchor */}
        <div
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full"
          style={{
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '12px solid white',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))',
          }}
        />

        {/* Content */}
        <div className="p-3">
          {/* Header: Avatar, Name, Timestamp */}
          <div className="flex items-start gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-xs font-medium flex-shrink-0">
              {firstChar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {comment.userName}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatTimestamp(comment.createdAt)}
                </span>
              </div>
            </div>
            {canDelete && onDelete && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Delete immediately (no confirmation, consistent with node/text deletion)
                  try {
                    onDelete();
                  } catch (err) {
                    console.error('Error calling onDelete:', err);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                className="text-gray-400 hover:text-red-600 transition-colors p-1 flex-shrink-0 z-10 relative"
                title="Delete comment"
                style={{ pointerEvents: 'auto', zIndex: 50 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>

          {/* Text content / Editor */}
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="Place your text here"
              className="w-full px-0 py-1 text-sm text-gray-900 border-none outline-none resize-none focus:ring-0"
              style={{
                minHeight: '40px',
                fontFamily: 'inherit',
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="text-sm text-gray-700 whitespace-pre-wrap cursor-text min-h-[20px]"
              onClick={handleClick}
            >
              {comment.text || 'Place your text here'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

