import * as monaco from 'monaco-editor';

export const createCustomCursor = (editor, {user, selections}) => {
    const addCustomSelections = (selections) => {
        const decorations = selections.map(selection => ({
            range: new monaco.Range(
                Math.min(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.min(selection.positionColumn, selection.selectionStartColumn),
                Math.max(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.max(selection.positionColumn, selection.selectionStartColumn),
            ),
            options: {
                className: `user-selection user-color-${1}`,
            }
        }));
    
        return editor.createDecorationsCollection(decorations);
    }

    const createCursorDecoration = selections => {
        return editor.createDecorationsCollection(
            selections.map(({positionLineNumber: line, positionColumn: column}) => ({
               range: new monaco.Range(line, column, line, column),
               options: {
                   className: `fake-cursor user-color-${1}`
               }
           }))
        );
    };
    
    
    const createLabelWidget = selections => {
        const getPosition = line => {
            if (line === 1) return monaco.editor.ContentWidgetPositionPreference.BELOW
            return monaco.editor.ContentWidgetPositionPreference.ABOVE
        }

        return selections.map(({positionLineNumber: line, positionColumn: column}) => {
            const widgetId = `label-widget-${line}-${column}-${user.userId}`;
            const widget = {
                suppressMouseDown: false,
                getId: () => widgetId,
                getDomNode: () => {
                    const domNode = document.createElement("div");
                    domNode.classList.add("cursor-lable", `user-color-${1}`);
                    domNode.innerText = user.username;
                    return domNode;
                },
                getPosition: () => ({
                    position: { lineNumber: line, column: Math.max(1, Math.ceil(column - user.username.length / 2)) },
                    preference: [getPosition(line)]
                })
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
        widgets.forEach(widget => editor.removeContentWidget(widget))
        delete user.clearCursor;
    }
}