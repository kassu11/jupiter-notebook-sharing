import * as monaco from 'monaco-editor';
const notebook = document.querySelector("#notebook");

window.addEventListener("mousemove", ({x, y}) => {
    const userLabels = document.querySelectorAll(".cursor-lable");
    userLabels.forEach(lable => {
        const {left, top, bottom} = lable.getBoundingClientRect()
        const distance = Math.hypot(left - x, (bottom + top) / 2 - y);

        lable.classList.toggle("hovered", distance < 30);
    })
});

export const createCustomCursor = (editor, { user, selections }) => {
    const addCustomSelections = (selections) => {
        const decorations = selections.map(selection => ({
            range: new monaco.Range(
                Math.min(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.min(selection.positionColumn, selection.selectionStartColumn),
                Math.max(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.max(selection.positionColumn, selection.selectionStartColumn),
            ),
            options: {
                className: `user-selection user-color-${user.color}`,
            }
        }));

        return editor.createDecorationsCollection(decorations);
    }

    const createCursorDecoration = selections => {
        return editor.createDecorationsCollection(
            selections.map(({ positionLineNumber: line, positionColumn: column }) => ({
                range: new monaco.Range(line, column, line, column),
                options: {
                    className: `fake-cursor user-color-${user.color}`,
                }
            }))
        );
    };


    const createLabelWidget = selections => {
        const getPosition = line => {
            if (line === 1) return monaco.editor.ContentWidgetPositionPreference.BELOW
            return monaco.editor.ContentWidgetPositionPreference.ABOVE
        }

        const widgetIdSet = new Set();

        return selections.map(({ positionLineNumber: line, positionColumn: column }) => {
            const widgetId = `label-widget-${line}-${column}-${user.userId}`;
            if (widgetIdSet.has(widgetId)) return null;
            widgetIdSet.add(widgetId);

            const widget = {
                suppressMouseDown: false,
                getId: () => widgetId,
                getDomNode: () => {
                    const domNode = document.createElement("div");
                    domNode.classList.add("cursor-lable", `user-color-${user.color}`);
                    domNode.innerText = user.username;
                    return domNode;
                },
                getPosition: () => ({
                    position: { lineNumber: line, column: column },
                    preference: [getPosition(line)]
                }),
            };

            editor.addContentWidget(widget);
            return widget;
        });
    };

    user.clearCursor?.();

    const decorations = addCustomSelections(selections);
    const cursors = createCursorDecoration(selections);
    const widgets = createLabelWidget(selections);

    user.clearCursor = () => {
        decorations.clear();
        cursors.clear();
        widgets.forEach(widget => widget && editor.removeContentWidget(widget))
        delete user.clearCursor;
        delete user.scrollToCursor;
    }

    user.scrollToCursor = () => {
        for (const widget of widgets) {
            if (!widget) continue;

            const widgetElem = document.querySelector(`[widgetid="${widget.getId()}"]`);
            const { top } = widgetElem.getBoundingClientRect();
            const height = notebook.clientHeight;

            notebook.scrollBy(0, top - height / 2)
            return;
        }
    }
}