import Heading from '@tiptap/extension-heading';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

const pluginKey = new PluginKey('collapsibleHeading');

/**
 * iOS 노트앱 스타일 접기/펼치기 헤딩
 * - Heading 확장으로 level + collapsed 속성 직접 정의 (this.parent 의존 제거)
 * - 헤딩 좌측 ▾/▸ 토글 클릭으로 하위 콘텐츠 접기/펼치기
 * - 같은 레벨 또는 상위 레벨 헤딩까지의 콘텐츠를 접음
 * - collapsed 상태는 문서 JSON에 저장됨
 */
export const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      // Explicitly define level (not relying on this.parent?.() spread)
      level: {
        default: 1,
        rendered: false,
      },
      collapsed: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.collapsed) return {};
          return {'data-collapsed': 'true'};
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Shift-c': () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        const $pos = selection.$anchor;
        if ($pos.depth < 1) return false;
        const heading = $pos.node(1);
        if (heading.type.name !== 'heading') return false;
        const headingPos = $pos.before(1);
        const tr = state.tr.setNodeMarkup(headingPos, undefined, {
          ...heading.attrs,
          collapsed: !heading.attrs.collapsed,
        });
        dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? [];
    return [
      ...parentPlugins,
      new Plugin({
        key: pluginKey,
        props: {
          decorations(state) {
            const {doc} = state;
            const decorations: Decoration[] = [];
            let hideUntilLevel: number | null = null;

            doc.forEach((node, offset) => {
              const isHeading = node.type.name === 'heading';
              const level = isHeading ? (node.attrs.level as number) : Infinity;

              // If this heading ends a collapsed section
              if (isHeading && hideUntilLevel !== null && level <= hideUntilLevel) {
                hideUntilLevel = null;
              }

              // Hide nodes in collapsed sections
              if (hideUntilLevel !== null) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: 'collapsed-content',
                  }),
                );
              }

              // Add toggle classes to headings
              if (isHeading) {
                const collapsed = !!node.attrs.collapsed;
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: `collapsible-heading ${collapsed ? 'is-collapsed' : 'is-expanded'}`,
                  }),
                );

                if (collapsed && hideUntilLevel === null) {
                  hideUntilLevel = level;
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },

          handleClick(view, pos, event) {
            const {state} = view;
            const $pos = state.doc.resolve(pos);

            // Heading is at depth 1 (direct child of doc)
            if ($pos.depth < 1) return false;
            const heading = $pos.node(1);
            if (heading.type.name !== 'heading') return false;

            const headingPos = $pos.before(1);
            const dom = view.nodeDOM(headingPos) as HTMLElement | null;
            if (!dom) return false;

            // Only toggle when clicking the chevron area (left padding area)
            const rect = dom.getBoundingClientRect();
            if ((event as MouseEvent).clientX - rect.left > 36) return false;

            const tr = state.tr.setNodeMarkup(headingPos, undefined, {
              ...heading.attrs,
              collapsed: !heading.attrs.collapsed,
            });
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
