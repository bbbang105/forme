'use client';

import {Node, mergeAttributes} from '@tiptap/core';
import type {RawCommands} from '@tiptap/core';
import {ReactNodeViewRenderer, NodeViewWrapper} from '@tiptap/react';
import type {ReactNodeViewProps} from '@tiptap/react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {X} from 'lucide-react';

/* ── Type augmentation for setImage command ── */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImage: (attrs: {src: string; alt?: string; title?: string}) => ReturnType;
    };
  }
}

/* ── React NodeView Component ── */

function ImageBlockView({node, updateAttributes, deleteNode, selected}: ReactNodeViewProps) {
  const {src, alt, width, caption} = node.attrs as {
    src: string; alt: string; title: string; width: number | null; caption: string;
  };
  const [isHovered, setIsHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const showControls = selected || isHovered;

  // Mouse resize
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!imgRef.current) return;
    setResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = imgRef.current.offsetWidth;
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + diff);
      updateAttributes({width: newWidth});
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, updateAttributes]);

  // Touch resize
  const onTouchResizeStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (!imgRef.current) return;
    setResizing(true);
    startXRef.current = e.touches[0].clientX;
    startWidthRef.current = imgRef.current.offsetWidth;
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onTouchMove = (e: TouchEvent) => {
      const diff = e.touches[0].clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + diff);
      updateAttributes({width: newWidth});
    };
    const onTouchEnd = () => setResizing(false);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper className="image-block-wrapper" data-drag-handle>
      <figure
        className={`image-block ${selected ? 'selected' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{width: width ? `${width}px` : undefined}}
      >
        {/* Delete button */}
        {showControls && (
          <button
            type="button"
            className="image-block-delete"
            onClick={deleteNode}
            aria-label="이미지 삭제"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Image */}
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          draggable={false}
          style={{width: '100%', height: 'auto'}}
        />

        {/* Resize handle (bottom-right corner) */}
        {showControls && (
          <div
            className="image-block-resize-handle"
            onMouseDown={onResizeStart}
            onTouchStart={onTouchResizeStart}
          />
        )}

        {/* Caption — rendered as text only (no dangerouslySetInnerHTML) to prevent XSS via crafted attrs */}
        <figcaption
          className="image-block-caption"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="캡션 추가..."
          onBlur={(e) => {
            updateAttributes({caption: e.currentTarget.textContent || ''});
          }}
        >
          {caption || ''}
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}

/* ── TipTap Extension ── */

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: false,
  draggable: true,

  addAttributes() {
    return {
      src: {default: null},
      alt: {default: ''},
      title: {default: ''},
      width: {default: null},
      caption: {default: ''},
    };
  },

  parseHTML() {
    return [
      // Parse <figure> with <img> (new format)
      {
        tag: 'figure[data-type="image-block"]',
        getAttrs(dom: HTMLElement) {
          const img = dom.querySelector('img');
          const figcaption = dom.querySelector('figcaption');
          return {
            src: img?.getAttribute('src'),
            alt: img?.getAttribute('alt') || '',
            width: dom.style.width ? parseInt(dom.style.width) : null,
            caption: figcaption?.textContent || '',
          };
        },
      },
      // Fallback: parse plain <img> for backward compat
      {
        tag: 'img[src]',
        getAttrs(dom: HTMLElement) {
          const widthAttr = dom.getAttribute('width');
          const style = dom.getAttribute('style') || '';
          let width: number | null = null;
          if (widthAttr) width = parseInt(widthAttr);
          else {
            const match = style.match(/width:\s*(\d+)px/);
            if (match) width = parseInt(match[1]);
          }
          return {
            src: dom.getAttribute('src'),
            alt: dom.getAttribute('alt') || '',
            title: dom.getAttribute('title') || '',
            width,
          };
        },
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    const {src, alt, title, width, caption} = HTMLAttributes;
    const figureAttrs: Record<string, string> = {'data-type': 'image-block'};
    if (width) figureAttrs.style = `width: ${width}px`;

    return [
      'figure',
      figureAttrs,
      ['img', mergeAttributes({src, alt, title, draggable: 'false'})],
      ['figcaption', {}, caption || ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },

  addCommands() {
    return {
      setImage:
        (attrs: {src: string; alt?: string; title?: string}) =>
        ({commands}) => {
          return commands.insertContent({type: this.name, attrs});
        },
    } satisfies Partial<RawCommands> as never;
  },
});
