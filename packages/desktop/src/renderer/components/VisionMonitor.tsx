/**
 * VisionMonitor — Displays screenshots captured during Phase 2 vision analysis.
 */

import React, { useState } from 'react';
import { Camera, X, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VisionCapture } from '../types.js';

interface Props {
  captures: VisionCapture[];
}

export function VisionMonitor({ captures }: Props) {
  const [selected, setSelected] = useState<VisionCapture | null>(null);

  if (captures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-surface-400">
        <Camera size={32} className="opacity-30" />
        <p className="text-sm">No screenshots captured yet.</p>
        <p className="text-xs text-surface-500">
          Images appear here when the agent uses the Vision tool.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Grid of thumbnails */}
      <div className="h-full overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
        {captures.map((cap) => (
          <button
            key={cap.id}
            onClick={() => setSelected(cap)}
            className="group relative rounded-lg overflow-hidden border border-surface-500
                       hover:border-gemini-500 transition-colors bg-surface-700"
          >
            <img
              src={cap.url}
              alt={cap.caption}
              className="w-full h-28 object-cover object-top"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100
                            transition-opacity flex items-center justify-center">
              <ZoomIn size={24} className="text-white" />
            </div>
            <div className="p-1.5 text-[10px] text-surface-400 truncate">
              {new Date(cap.timestamp).toLocaleTimeString()}
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-8"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-4xl w-full bg-surface-800 rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-surface-600">
                <span className="text-sm text-surface-300 truncate">{selected.caption.slice(0, 100)}</span>
                <button
                  onClick={() => setSelected(null)}
                  className="text-surface-400 hover:text-surface-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <img src={selected.url} alt={selected.caption} className="w-full max-h-[70vh] object-contain" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
