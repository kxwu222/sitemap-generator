import { useState } from 'react';
import { Palette, X } from 'lucide-react';

interface ColorPaletteProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
  selectedTextColor?: string;
  onTextColorChange?: (color: string) => void;
}


export function ColorPalette({ selectedColor, onColorChange, onClose, selectedTextColor, onTextColorChange }: ColorPaletteProps) {
  const [customColor, setCustomColor] = useState(selectedColor || '#3b82f6');
  const [customTextColor, setCustomTextColor] = useState(selectedTextColor || '#ffffff');

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    onColorChange(color);
  };

  const handleCustomTextColorChange = (color: string) => {
    setCustomTextColor(color);
    if (onTextColorChange) {
      onTextColorChange(color);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md border border-gray-300 rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold">Choose Color</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        
        <div className="p-6">
          {/* Custom Color Picker */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Node Background Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                className="w-12 h-12 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900 font-mono"
                placeholder="#3b82f6"
              />
            </div>
          </div>

          {/* Text Color Picker */}
          {onTextColorChange && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customTextColor}
                  onChange={(e) => handleCustomTextColorChange(e.target.value)}
                  className="w-12 h-12 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={customTextColor}
                  onChange={(e) => handleCustomTextColorChange(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-900 font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>
          )}


          {/* Selected Color Preview */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
            <div
              className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center text-xs font-bold"
              style={{ 
                backgroundColor: customColor,
                color: customTextColor || '#ffffff'
              }}
            >
              A
            </div>
            <div className="text-sm">
              <div className="font-medium text-gray-900">Preview</div>
              <div className="font-mono text-gray-600">
                BG: {customColor}
                {customTextColor && ` | Text: ${customTextColor}`}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
