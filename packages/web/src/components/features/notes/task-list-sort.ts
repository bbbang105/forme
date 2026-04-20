import {Extension} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';

const pluginKey = new PluginKey('taskListSort');

/**
 * 1) 새 태스크 아이템에 고유 taskId 자동 부여
 * 2) 체크된 아이템을 리스트 하단으로 자동 정렬 (stable sort)
 */
export const TaskListSort = Extension.create({
  name: 'taskListSort',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // Skip if this is our own ID-assignment transaction
          if (transactions.some((tr) => tr.getMeta('taskIdAssignment'))) return null;

          const {doc} = newState;
          const tr = newState.tr;
          let assignedIds = false;

          // Phase 1: Assign unique taskId to items that don't have one
          doc.descendants((node, pos) => {
            if (node.type.name === 'taskItem' && !node.attrs.taskId) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                taskId: crypto.randomUUID(),
              });
              assignedIds = true;
            }
          });

          if (assignedIds) {
            tr.setMeta('addToHistory', false);
            tr.setMeta('taskIdAssignment', true);
            return tr;
          }

          // Phase 2: Sort task lists — unchecked first, checked last
          type PNode = typeof doc;
          const taskLists: Array<{pos: number; node: PNode}> = [];

          doc.descendants((node, pos) => {
            if (node.type.name === 'taskList') {
              let seenChecked = false;
              let needsSort = false;
              node.forEach((child) => {
                if (child.attrs.checked) seenChecked = true;
                else if (seenChecked) needsSort = true;
              });
              if (needsSort) taskLists.push({pos, node});
              return false;
            }
          });

          if (taskLists.length === 0) return null;

          // Process in reverse order to preserve positions
          for (let i = taskLists.length - 1; i >= 0; i--) {
            const {pos, node} = taskLists[i];

            type Item = {node: PNode; checked: boolean};
            const items: Item[] = [];
            node.forEach((child) => {
              items.push({node: child, checked: !!child.attrs.checked});
            });

            const sorted = [
              ...items.filter((item) => !item.checked),
              ...items.filter((item) => item.checked),
            ];

            const from = pos + 1;
            const to = pos + node.nodeSize - 1;
            tr.replaceWith(
              from,
              to,
              sorted.map((item) => item.node),
            );
          }

          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
