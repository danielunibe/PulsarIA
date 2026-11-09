import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LibItem } from '../types';
import { PulsarMarkIcon } from './SvgIcons';
import { getProceduralImage } from '../utils/proceduralCanvas';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: LibItem[];
  onSelectItem: (item: LibItem) => void;
  customImages: Record<string, string>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  items,
  onSelectItem,
  customImages,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredItems = items
    .filter((v) => {
      if (!query.trim()) return true;
      const haystack = `${v.h} ${v.c} ${v.tg}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .slice(0, 5);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setIsSearching(true);
      const timer = setTimeout(() => {
        setIsSearching(false);
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredItems.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        onSelectItem(filteredItems[selectedIndex]);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="palette on"
          id="palette"
          role="dialog"
          aria-modal="true"
          aria-label="Buscador de memoria"
        >
          <motion.div
            className="palette-bg"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className={`pal ${isSearching ? 'searching' : ''}`}
            id="pal"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="pal-h">
              <PulsarMarkIcon className="glyph" />
              <input
                ref={inputRef}
                id="palIn"
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Search your memory…  ¿cómo hacía aquella señora las tortillas?"
                aria-label="Buscar en tu memoria"
              />
              <span className="esc" onClick={onClose} role="button" tabIndex={0}>
                ESC
              </span>
            </div>

            <div
              className="pal-r"
              id="palRes"
              role="listbox"
              aria-label="Resultados"
            >
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => {
                  const imgSrc =
                    customImages[item.sc] || getProceduralImage(item.sc);
                  const isCur = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`pal-it ${isCur ? 'cur' : ''}`}
                      role="option"
                      aria-selected={isCur}
                      onClick={() => {
                        onSelectItem(item);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <u>
                        <img src={imgSrc} alt="" />
                      </u>
                      <div style={{ minWidth: 0 }}>
                        <b>{item.c}</b>
                        <span>
                          {item.h} · {item.d}
                        </span>
                      </div>
                      <span className="why">
                        {query.trim() ? 'semántico' : 'reciente'}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="pal-it">
                  <span style={{ color: 'var(--gray)', fontSize: '13px' }}>
                    Sin resultados en tu biblioteca.
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
