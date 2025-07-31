import React, { useRef, useState, useEffect, useCallback } from 'react';
import './HorizontalScrollMenu.css';

const HorizontalScrollMenu = ({ items = [], onItemClick }) => {
  const menuRef = useRef(null);
  const glassRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [glassPosition, setGlassPosition] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // No need for infinite items since glass moves instead of content scrolling
  const itemWidth = 136; // 120px width + 16px gap
  const containerWidth = 1200; // max container width

  const moveGlassToIndex = useCallback((index) => {
    const actualIndex = index % items.length;
    const container = menuRef.current;
    if (!container) return;
    
    // Calculate position for glass box based on centered items
    const containerRect = container.getBoundingClientRect();
    const totalItemsWidth = items.length * itemWidth;
    const startOffset = (containerRect.width - totalItemsWidth) / 2 + 20; // 20px padding
    const targetPosition = startOffset + (actualIndex * itemWidth);
    
    setGlassPosition(targetPosition);
    setActiveIndex(actualIndex);
  }, [items.length, itemWidth]);

  const getIndexFromGlassPosition = useCallback((position) => {
    const container = menuRef.current;
    if (!container) return 0;
    
    const containerRect = container.getBoundingClientRect();
    const totalItemsWidth = items.length * itemWidth;
    const startOffset = (containerRect.width - totalItemsWidth) / 2 + 20; // 20px padding
    const adjustedPosition = position - startOffset;
    let index = Math.round(adjustedPosition / itemWidth);
    
    // Clamp index to valid range
    index = Math.max(0, Math.min(items.length - 1, index));
    
    return index;
  }, [items.length, itemWidth]);

  const snapToClosest = useCallback(() => {
    const closestIndex = getIndexFromGlassPosition(glassPosition);
    moveGlassToIndex(closestIndex);
  }, [glassPosition, getIndexFromGlassPosition, moveGlassToIndex]);

  useEffect(() => {
    if (!menuRef.current) return;
    // Initialize glass position to first item
    const timeout = setTimeout(() => moveGlassToIndex(0), 100);
    return () => clearTimeout(timeout);
  }, [moveGlassToIndex]);

  const startDrag = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const pageX = e.touches ? e.touches[0].pageX : e.pageX;
    setStartX(pageX);
    document.body.style.cursor = 'grabbing';
  };

  const stopDrag = () => {
    if (isDragging) snapToClosest();
    setIsDragging(false);
    document.body.style.cursor = '';
  };

  const onDrag = (e) => {
    if (!isDragging) return;
    const pageX = e.touches ? e.touches[0].pageX : e.pageX;
    const walk = pageX - startX;
    const newPosition = glassPosition + walk;
    
    // Set bounds for glass movement based on item positions
    const container = menuRef.current;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const totalItemsWidth = items.length * itemWidth;
    const startOffset = (containerRect.width - totalItemsWidth) / 2 + 20;
    const endOffset = startOffset + totalItemsWidth - itemWidth;
    
    const boundedPosition = Math.max(startOffset, Math.min(endOffset, newPosition));
    setGlassPosition(boundedPosition);
    
    // Update active index based on glass position
    const newIndex = getIndexFromGlassPosition(boundedPosition);
    setActiveIndex(newIndex);
    
    setStartX(pageX);
  };

  const handleItemClick = (item, index) => {
    if (!isDragging && onItemClick) {
      onItemClick(item);
    }
    moveGlassToIndex(index);
  };

  return (
    <div 
      className="drag-select-glass-menu"
      onMouseMove={onDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={onDrag}
      onTouchEnd={stopDrag}
    >
      <div
        ref={glassRef}
        className="glass-overlay-moveable"
        style={{
          transform: `translateX(${glassPosition}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease'
        }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      />

      <div ref={menuRef} className="scroll-container-menu">
        {items.map((item, idx) => (
          <div
            key={item.id || idx}
            className={`menu-item-card ${idx === activeIndex ? 'active' : ''}`}
            onClick={() => handleItemClick(item, idx)}
          >
            {item.href ? (
              <a href={item.href} className="menu-link-text">
                {item.label}
              </a>
            ) : (
              <span className="menu-text-span">{item.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalScrollMenu;