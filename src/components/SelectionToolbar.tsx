import { useState } from 'react';
import { PageNode } from '../utils/urlAnalyzer';

interface SelectionToolbarProps {
  selectedNodes: PageNode[];
  position: { x: number; y: number };
  onEditTitle?: (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onAddChild?: (nodeId: string) => void;
  onColorClick?: (nodeIds: string[], event: React.MouseEvent<HTMLButtonElement>) => void;
  onLinkClick?: (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (nodeIds: string[]) => void;
  onAlign?: (nodeIds: string[], direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onGroup?: (nodeIds: string[]) => void;
  groups?: string[];
  onMoveToGroup?: (group: string, opts?: { includeSubtree?: boolean }) => void;
  onMoveMultiSelectionToGroup?: (groupName: string) => void;
  onCreateGroupFromMultiSelection?: (nodeIds: string[], groupName: string) => void;
  onDeleteGroup?: (groupName: string) => void;
}

export function SelectionToolbar({
  selectedNodes,
  position,
  onEditTitle,
  onAddChild,
  onColorClick,
  onLinkClick,
  onDelete,
  onAlign,
  onGroup,
  groups,
  onMoveToGroup,
  onMoveMultiSelectionToGroup,
  onCreateGroupFromMultiSelection,
  onDeleteGroup,
}: SelectionToolbarProps) {
  const isSingleSelection = selectedNodes.length === 1;
  const isMultiSelection = selectedNodes.length > 1;
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [multiGroupMenuOpen, setMultiGroupMenuOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const handleDelete = () => {
    if (onDelete) {
      const nodeIds = selectedNodes.map(n => n.id);
      // Delete immediately without extra confirmations (requested)
      onDelete(nodeIds);
    }
  };

  return (
    <div
      className="fixed flex items-center gap-1 bg-white border border-gray-300 rounded-lg shadow-lg px-2 py-2 z-40"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
      }}
    >
      {/* Single Selection Tools */}
      {isSingleSelection && (
        <>
          {/* Edit Title */}
          {onEditTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditTitle(selectedNodes[0].id, e);
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
              style={{ pointerEvents: 'auto' }}
              title="Edit title"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Edit Title
              </span>
            </button>
          )}

          {/* Add Node */}
          {onAddChild && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(selectedNodes[0].id);
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
          )}

          {/* Color */}
          {onColorClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onColorClick([selectedNodes[0].id], e);
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
          )}

          {/* Link */}
          {onLinkClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLinkClick(selectedNodes[0].id, e);
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
          )}

          {/* {onMoveToGroup && groups && groups.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setGroupMenuOpen(v => !v); }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
                title="Move to group"
              >
                <img width="48" height="48" src="https://img.icons8.com/fluency-systems-filled/48/shuffle.png" alt="shuffle"/>
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Move to group
                </span>
              </button>
              {groupMenuOpen && (
                <div
                  className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded shadow-lg z-40 min-w-[140px] py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {groups.map(g => (
                    <button
                      key={g}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                      onClick={() => {
                        onMoveToGroup(g, { includeSubtree: false });
                        setGroupMenuOpen(false);
                      }}
                      title={`Move selection to "${g}"`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )} */}

          <div className="w-px h-6 bg-gray-300 mx-1"></div>
        </>
      )}

      {/* Multi Selection Tools */}
      {isMultiSelection && (
        <>
          {/* Color All */}
          {onColorClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const nodeIds = selectedNodes.map(n => n.id);
                onColorClick(nodeIds, e);
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
              style={{ pointerEvents: 'auto' }}
              title="Color all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="text-gray-700" viewBox="0 0 16 16">
                <path d="M15.825.12a.5.5 0 0 1 .132.584c-1.53 3.43-4.743 8.17-7.095 10.64a6.1 6.1 0 0 1-2.373 1.534c-.018.227-.06.538-.16.868-.201.659-.667 1.479-1.708 1.74a8.1 8.1 0 0 1-3.078.132 4 4 0 0 1-.562-.135 1.4 1.4 0 0 1-.466-.247.7.7 0 0 1-.204-.288.62.62 0 0 1 .004-.443c.095-.245.316-.38.461-.452.394-.197.625-.453.867-.826.095-.144.184-.297.287-.472l.117-.198c.151-.255.326-.54.546-.848.528-.739 1.201-.925 1.746-.896q.19.012.348.048c.062-.172.142-.38.238-.608.261-.619.658-1.419 1.187-2.069 2.176-2.67 6.18-6.206 9.117-8.104a.5.5 0 0 1 .596.04M4.705 11.912a1.2 1.2 0 0 0-.419-.1c-.246-.013-.573.05-.879.479-.197.275-.355.532-.5.777l-.105.177c-.106.181-.213.362-.32.528a3.4 3.4 0 0 1-.76.861c.69.112 1.736.111 2.657-.12.559-.139.843-.569.993-1.06a3 3 0 0 0 .126-.75zm1.44.026c.12-.04.277-.1.458-.183a5.1 5.1 0 0 0 1.535-1.1c1.9-1.996 4.412-5.57 6.052-8.631-2.59 1.927-5.566 4.66-7.302 6.792-.442.543-.795 1.243-1.042 1.826-.121.288-.214.54-.275.72v.001l.575.575zm-4.973 3.04.007-.005zm3.582-3.043.002.001h-.002z"/>
              </svg>
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Color All (C)
              </span>
            </button>
          )}

          {/* Align */}
          {onAlign && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // For now, just align left as default - we'll add dropdown later
                const nodeIds = selectedNodes.map(n => n.id);
                onAlign(nodeIds, 'left');
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
              style={{ pointerEvents: 'auto' }}
              title="Align nodes"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                <line x1="21" y1="10" x2="3" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="21" y1="18" x2="3" y2="18" />
              </svg>
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Align
              </span>
            </button>
          )}

          {/* Group */}
          {onGroup && groups && groups.length > 0 && (
            <div className="relative" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setMultiGroupMenuOpen(v => !v); }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors group relative"
                style={{ pointerEvents: 'auto' }}
                title="Move to group"
              >
                <img width="18" height="18" src="https://img.icons8.com/fluency-systems-filled/48/shuffle.png" alt="shuffle"/>
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Move to group
                </span>
              </button>
              {multiGroupMenuOpen && (
                <div
                  className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded shadow-lg z-40 min-w-[140px] py-1"
                  style={{ pointerEvents: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {groups.map(g => (
                    <div
                      key={g}
                      className="group flex items-center justify-between px-3 py-1.5 hover:bg-gray-50"
                    >
                      <button
                        className="flex-1 text-left text-sm"
                        onClick={() => {
                          if (onMoveMultiSelectionToGroup) {
                            onMoveMultiSelectionToGroup(g);
                          }
                          setMultiGroupMenuOpen(false);
                        }}
                        title={`Move selection to "${g}"`}
                      >
                        {g}
                      </button>
                      {onDeleteGroup && (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-1 py-0.5 hover:bg-red-50 rounded text-red-600 text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteGroup) {
                              onDeleteGroup(g);
                            }
                          }}
                          title="Delete group"
                        >
                          −
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-gray-200 my-1"></div>
                  {isCreatingGroup ? (
                    <div className="px-3 py-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newGroupName.trim()) {
                            const nodeIds = selectedNodes.map(n => n.id);
                            if (onCreateGroupFromMultiSelection) {
                              onCreateGroupFromMultiSelection(nodeIds, newGroupName.trim());
                            }
                            setNewGroupName('');
                            setIsCreatingGroup(false);
                            setMultiGroupMenuOpen(false);
                          } else if (e.key === 'Escape') {
                            setNewGroupName('');
                            setIsCreatingGroup(false);
                          }
                        }}
                        placeholder="Enter group name..."
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          onClick={() => {
                            if (newGroupName.trim() && onCreateGroupFromMultiSelection) {
                              const nodeIds = selectedNodes.map(n => n.id);
                              onCreateGroupFromMultiSelection(nodeIds, newGroupName.trim());
                            }
                            setNewGroupName('');
                            setIsCreatingGroup(false);
                            setMultiGroupMenuOpen(false);
                          }}
                        >
                          Create
                        </button>
                        <button
                          className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                          onClick={() => {
                            setNewGroupName('');
                            setIsCreatingGroup(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-blue-600 font-medium"
                      onClick={() => {
                        setIsCreatingGroup(true);
                        setNewGroupName('');
                      }}
                    >
                      + New Group
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="w-px h-6 bg-gray-300 mx-1"></div>
        </>
      )}

      {/* Delete (both single and multi) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 transition-colors group relative"
        style={{ pointerEvents: 'auto' }}
        title="Delete"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Delete
        </span>
      </button>

      {/* Selection Count for multi-select */}
      {isMultiSelection && (
        <>
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <div className="px-2 text-xs font-medium text-gray-600">
            {selectedNodes.length} selected
          </div>
        </>
      )}
    </div>
  );
}

