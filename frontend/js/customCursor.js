import * as monaco from 'monaco-editor';

export const createCustomCursor = (editor, selections) => {
    const addCustomSelections = (selections) => {
        const decorations = selections.map(selection => ({
            range: new monaco.Range(
                Math.min(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.min(selection.positionColumn, selection.selectionStartColumn),
                Math.max(selection.positionLineNumber, selection.selectionStartLineNumber),
                Math.max(selection.positionColumn, selection.selectionStartColumn),
            ),
            options: {
                className: `user-selection user-color-${selection.userId}`,
            }
        }));
    
        return editor.createDecorationsCollection(decorations);
    }

    const createCursorDecoration = selections => {
        return selections.map(({positionLineNumber: line, positionColumn: column, userId}) => {
            return editor.createDecorationsCollection([
                {
                    range: new monaco.Range(line, column, line, column),
                    options: {
                        className: `fake-cursor user-color-${userId}`
                    }
                }
            ]);
        })
    };
    
    
    const createLabelWidget = selections => {
        const getPosition = line => {
            if (line === 1) return monaco.editor.ContentWidgetPositionPreference.BELOW
            return monaco.editor.ContentWidgetPositionPreference.ABOVE
        }

        return selections.map(({positionLineNumber: line, positionColumn: column, userId, username}) => {
            const widgetId = `label-widget-${line}-${column}`;
            const widget = {
                suppressMouseDown: false,
                getId: () => widgetId,
                getDomNode: () => {
                    const domNode = document.createElement("div");
                    domNode.classList.add("cursor-lable", `user-color-${userId}`);
                    domNode.innerText = username;
                    return domNode;
                },
                getPosition: () => ({
                    position: { lineNumber: line, column: Math.max(1, Math.ceil(column - username.length / 2)) },
                    preference: [getPosition(line)]
                })
            };
        
            // editor.getModel().getValueInRange()
        
            editor.addContentWidget(widget);
            return widget;
        });
    };

    addCustomSelections(selections);
    createCursorDecoration(selections);
    createLabelWidget(selections);

    // editor1.removeContentWidget(t);
}