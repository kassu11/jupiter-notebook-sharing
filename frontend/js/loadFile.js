import socketIO from "socket.io-client";
import {api} from "./api";
import * as monaco from 'monaco-editor';
import {createCustomCursor} from "./customCursor";

const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");
const users = document.querySelector("#users");
const username = document.querySelector("#username");

self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: '${window.location.origin}' };`
        )}`;
    }
};

const editorContainer = document.getElementById("editor-container");

editorContainer.addEventListener("wheel", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
}, {capture: true});

window.addEventListener("resize", () => resizeAllEditors());

function resizeAllEditors() {
    editors.forEach(editor => {
        editor.layout({
            width: editor.getContainerDomNode().clientWidth,
            height: editor.getContentHeight()
        });
    });
}


function changeEditorLanguage(editor, language) {
    const model = editor.getModel();
    if (language === "markdown") monaco.editor.setModelLanguage(model, language);
    else if (language === "code") monaco.editor.setModelLanguage(model, "python");
}


const files = {};
const allFileHandlers = [];
const allUnappliedChanges = {};
let currentFileName = "";
let currentKey = "";
let selectionStart = 0;
let selectionEnd = 0;
let selectionDirection = "forward";
let currentCelId = -1;

const allRoomUsers = {};

const socket = socketIO("https://jupiter-notebook-sharing.onrender.com/", {
    auth: (token) => {
        token({ token: "access" });
    }
});

window.addEventListener("resize", () => {
    document.querySelectorAll("textarea").forEach(updateTextAreaHeight);
});


username.addEventListener("input", () => {
    if (!currentKey.length) return;

    socket.emit("caretUpdate", {
        cel: currentCelId,
        key: currentKey,
        filename: currentFileName,
        selectionStart,
        selectionEnd,
        selectionDirection,
        username: username.value,
    });
});


window.addEventListener("keydown", async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
        event.preventDefault();
        const fileData = files[currentKey]?.[currentFileName];
        if (fileData) {
            await writeJsonDataToUserFile(fileData);
        }
    }
});

window.addEventListener("blur", async () => {
    const fileData = files[currentKey]?.[currentFileName];
    if (fileData && document.querySelector("#autosave").checked) {
        await writeJsonDataToUserFile(fileData);
    }
});

setInterval(() => {
    if (location.href.includes("localhost")) return;
    fetch("https://jupiter-notebook-sharing.onrender.com/").then(data => data.json());
}, 1000 * 60 * 5);

setInterval(async () => {
    for (const localFileData of allFileHandlers) {
        const file = await localFileData.handler.getFile();
        if (file.lastModified !== localFileData.lastModified) {
            localFileData.lastModified = file.lastModified;
            const fileText = await file.text();
            const jsonData = JSON.parse(fileText);
            const localCells = {};
            for(const cell of localFileData.data.cells) localCells[cell.id] = cell;

            localFileData.data = {...jsonData, cells: localFileData.data.cells};

            for (const newCell of jsonData.cells) {
                const cell = localCells[newCell.id];
                if (!cell) continue;

                cell.metadata = newCell.metadata;
                // cell.cell_type = newCell.cell_type;
                cell.outputs = newCell.outputs;
                cell.execution_count = newCell.execution_count;

                const elementIndex = localFileData.data.cells.findIndex(c => c === cell);
                const cellElem = document.querySelectorAll(".notebook-cell")[elementIndex];

                updateOutputFromCellElem(cellElem, newCell);

                // TODO: last_id is no longer set, add modified_since_last_save to file data
                if (newCell.last_id === cell.custom_modifications) {
                    if (Array.isArray(newCell.source)) newCell.source = newCell.source.join("");

                    changeInsideCell(
                        localFileData.key,
                        localFileData.name,
                        cell.id,
                        cell.source,
                        newCell.source
                    )
                }
            }

            console.log(localFileData.name, file.lastModified);
        }
    }
}, 100);

function generateRandomId() {
    const chars = "0123456789abcdefghijklmnopqrstuvxyz";
    return `${randomString(chars, 8)}-${randomString(chars, 4)}-${randomString(chars, 4)}-${randomString(chars, 4)}-${randomString(chars, 12)}`;
}

function randomString(chars, length) {
    return Array.from({length}, () => randomCharFromString(chars)).join("");
}

function randomCharFromString(string) {
    return string[Math.floor(Math.random() * string.length)];
}


// lag.addEventListener("click", async e => {
//     socket.emit("lag", "data")
// });

host.addEventListener("click", async () => {
    if (socket.id == null) {
        alert("Server is not yet open, try again");
        await api.getWelcomePage();
        return;
    }
    const key = prompt("Set custom room key");
    const filesData = await loadProjectFolder();

    for(const value of Object.values(filesData)) {
        value.key = key;
    }

    const response = await api.hostFiles({
        fileData: jsonDataCopyForServer(filesData), 
        key, 
        id: socket.id
    });

    if (response.status !== 200) return alert(response.message);

    files[key] = filesData;
    currentKey = key;
    host.setAttribute("disabled", "");
    join.setAttribute("disabled", "");

    generateFileTree(filesData);
    initLocalFileInfos(key, filesData);
    socketJoin(key);
});

join.addEventListener("click", async () => {
    if (socket.id == null) return alert("Server is not yet open, try again");
    const roomKey = prompt("Enter room key");

    const fetchedFiles = await api.getLoadedFiles({key: roomKey, id: socket.id});

    if (fetchedFiles.status !== 200) return alert(fetchedFiles.message);

    files[roomKey] = fetchedFiles.files;
    for(const value of Object.values(fetchedFiles.files)) {
        value.key = roomKey;
    }

    socket.emit("caretUpdate", { cel: -1, key: roomKey, username: username.value });

    fetchedFiles.users?.forEach(user => {
        if (user.id == socket.id) return;
        allRoomUsers[user.id] = user.caret ?? { cel: -1 }
        allRoomUsers[user.id].userId = user.id;
        allRoomUsers[user.id].color = user.color;
    });

    updateUserIcons();
    host.setAttribute("disabled", "");
    join.setAttribute("disabled", "");

    currentKey = roomKey;
    generateFileTree(fetchedFiles.files);
    initLocalFileInfos(roomKey, fetchedFiles.files);
    socketJoin(roomKey);
});

function generateFileTree(fileData) {
    const fileTreeObject = {};
    
    for(const file of Object.values(fileData)) {
        let curr = fileTreeObject;
        file.name.substring(1).split("/").forEach((n, i, arr) => {
            curr[n] ??= {};
            curr = curr[n];
            if (i == arr.length - 1) {
                curr.file = true
                curr.fullFileName = file.name;
            }; 
        });
    }

    function recursiveFoldering(rows, parentUl) {
        for (const [key, value] of rows) {
            if (value.file === true) {
                const li = document.createElement("li");
                li.setAttribute("file", value.fullFileName);
                li.textContent = key;
                li.classList.add("file");
                parentUl.append(li);
                li.addEventListener("click", () => displayFileData(fileData[value.fullFileName]));
            } else {
                const li = document.createElement("li");
                li.textContent = key;
                const ul = document.createElement("ul");
                li.append(ul);
                parentUl.append(li);
                recursiveFoldering(Object.entries(value), ul);
            }
        }
    }

    recursiveFoldering(Object.entries(fileTreeObject), fileTree);
}

function socketJoin(key) {
    socket.on(`userDisconnect${key}`, userData => {
        allRoomUsers[userData.userId]?.clearCursor?.();
        delete allRoomUsers[userData.userId];
        updateUserIcons();
    })

    socket.on(`caretUpdate${key}`, selectionPackage => {
        const curIndex = files[key][selectionPackage.filename]?.data.cells.findIndex(row => row.id === selectionPackage.cel);
        const editor = files[key][selectionPackage.filename]?.data.cells[curIndex]?.editor;

        if(editor) {
            selectionPackage.selections &&= preprocessSelection(editor, selectionPackage.selections);
        }

        const oldCarets = allRoomUsers[selectionPackage.userId];
        if (oldCarets) allRoomUsers[selectionPackage.userId] = {...oldCarets, ...selectionPackage};
        else allRoomUsers[selectionPackage.userId] = selectionPackage;

        updateUserIcons();

        if (curIndex === -1) return allRoomUsers[selectionPackage.userId]?.clearCursor?.();
        if (currentFileName !== selectionPackage.filename) return;
        
        if (selectionPackage.selections) createCustomCursor(editor, {...selectionPackage, user: allRoomUsers[selectionPackage.userId]});
        else allRoomUsers[selectionPackage.userId]?.clearCursor?.();
    });

    socket.on(`cellChange${key}`, change => {
        const unappliedChanges = allUnappliedChanges[key + change.filename]
        const [unappliedChange] = unappliedChanges.unappliedFileChanges;
        const domAlreadyUpdated = JSON.stringify(change) === JSON.stringify(unappliedChange);
        const fileActive = currentFileName === change.filename;
        if (domAlreadyUpdated) {
            unappliedChanges.unappliedFileChanges.shift();
        }

        const fileData = files[change.key][change.filename];
        const cellIndex = fileData.data.cells.findIndex(v => v.id === change.cel);
        if (cellIndex === -1) return console.error("Cell change cancelled do to unknown cell id");

        if (change.type === "delete") {
            fileData.data.cells.splice(cellIndex, 1);
            if (fileActive) {
                document.querySelectorAll(".notebook-cell")[cellIndex].remove();
            }
        } else if (change.type === "add") {
            fileData.data.cells.splice(cellIndex + 1, 0, change.data);
            initLocalFileInfos(key, [fileData]);
            if (fileActive) {
                const parentElem = document.querySelectorAll(".notebook-cell")[cellIndex];
                addCellElement(change.data, fileData, {type: "after", elem: parentElem});
            }
        } else if (change.type === "moveUp") {
            if (fileActive) {
                const nextCell = document.querySelectorAll(".notebook-cell")[cellIndex - 1];
                const current = document.querySelectorAll(".notebook-cell")[cellIndex];
                const activeCellElem = document.activeElement?.closest(".notebook-cell");

                if(activeCellElem === current) current.after(nextCell);
                else nextCell.before(current);
            }
            [fileData.data.cells[cellIndex - 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex - 1]]
        } else if (change.type === "moveDown") {
            if (fileActive) {
                const prevCell = document.querySelectorAll(".notebook-cell")[cellIndex + 1];
                const current = document.querySelectorAll(".notebook-cell")[cellIndex];
                const activeCellElem = document.activeElement?.closest(".notebook-cell");
                
                if(activeCellElem === current) current.before(prevCell);
                else prevCell.after(current);
            }

            [fileData.data.cells[cellIndex + 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex + 1]]
        } else if(change.type === "changeType") {
            fileData.data.cells[cellIndex].cell_type = change.newType;
            if (fileActive) {
                const cellElem = document.querySelectorAll(".notebook-cell")[cellIndex];
                cellElem.querySelector("select").value = change.newType;
                cellElem.classList.toggle("markdown", change.newType === "markdown");
                changeEditorLanguage(fileData.data.cells[cellIndex].editor, change.newType);
            }
        }
    });

    socket.on(`fileUpdates${key}`, changePackage => {
        const unappliedChanges = allUnappliedChanges[key + changePackage.filename][changePackage.cel].unappliedChanges;
        const fileData = files[changePackage.key][changePackage.filename];
        const cellIndex = fileData.data.cells.findIndex(v => v.id === changePackage.cel);
        const cell = fileData.data.cells[cellIndex];
        const fileUsers = getFileUsers(changePackage);
        let needToUpdateSelection = changePackage.cel === currentCelId && currentFileName === changePackage.filename;
        if(unappliedChanges.length) {
            const removeUserId = (key, val) => key === "userId" ? undefined : val;
            if (JSON.stringify(changePackage, removeUserId) === JSON.stringify(unappliedChanges[0])) {
                unappliedChanges.shift();
                needToUpdateSelection = false;
            }
        }

        const selections = cell.editor ?
            preprocessSelection(cell.editor, cell.editor.getSelections())
            : [];

        fileUsers.forEach(user => user.clearCursor?.());

        if (cell.editor) changeEditorText(
            cell.editor,
            cell.source,
            [changePackage, ...unappliedChanges]
        );

        for(let i = 1; i < changePackage.changes.length; i++) {
            for(let j = 0; j < i; j++) {
                changePackage.changes[i] = advanceChangeForward(changePackage.changes[j], changePackage.changes[i]);
            }
        }

        if (needToUpdateSelection) {
            cell.editor.setSelections(selections.map(selection => {
                return getUpdatedSelectionByChanges(cell.editor, changePackage.changes, selection);
            }));
        }

        if (cell.editor) updateUserCarets(cell.editor, fileUsers, changePackage);

        for (let i = 0; i < unappliedChanges.length; i++) {
            for (const change of changePackage.changes) {
                for(let j = 0; j < unappliedChanges[i].changes.length; j++) {
                    unappliedChanges[i].changes[j] = advanceChangeForward(change, unappliedChanges[i].changes[j]);
                }
            }
            unappliedChanges[i].custom_modifications++;
        }

        for (const change of changePackage.changes) {
            cell.source = cell.source.substring(0, change.start) + change.data + cell.source.substring(change.end);
        }
        cell.custom_modifications++;
    });

    function preprocessSelection(editor, selections) {
        for(const selection of selections) {
            selection.start = editor.getModel().getOffsetAt({
                lineNumber: selection.startLineNumber, 
                column: selection.startColumn
            });
            selection.end = editor.getModel().getOffsetAt({
                lineNumber: selection.endLineNumber, 
                column: selection.endColumn
            });
        }

        return selections;
    }

    function getFileUsers(changePackage) {
        const fileUsers = [];
        for (const user of Object.values(allRoomUsers)) {
            if (user.cel !== changePackage.cel) continue;
            if (user.key !== changePackage.key) continue;
            if (user.filename !== changePackage.filename) continue;
            if (!user.selections) continue;

            fileUsers.push(user);
        }

        return fileUsers;
    }

    function getUpdatedSelectionByChanges(editor, changes, selection) {
        const isDirectionFlipped =
            selection.positionLineNumber <= selection.selectionStartLineNumber &&
            selection.positionColumn <= selection.selectionStartColumn;

        for (const change of changes) {
            const delta = change.data.length - (change.end - change.start);

            if (selection.end <= change.start && selection.end - selection.start >= 0) continue;
            else if (change.end <= selection.start) {
                selection.start += delta;
                selection.end += delta;
            }
            else if (selection.start <= change.start && change.start < selection.end && change.end > selection.end) selection.end = change.start;
            else if (selection.start <= change.start && change.start < selection.end) selection.end += delta;
            else if (change.start < selection.start && change.end < selection.end) {
                selection.start = change.end + delta;
                selection.end += delta;
            }
            else {
                selection.start = change.end + delta;
                selection.end = change.end + delta;
            }
        }

        if (isDirectionFlipped) [selection.start, selection.end] = [selection.end, selection.start];

        const { lineNumber: selectionStartLineNumber, column: selectionStartColumn } =
            editor.getModel().getPositionAt(selection.start);
        const { lineNumber: positionLineNumber, column: positionColumn } =
            editor.getModel().getPositionAt(selection.end);

        return {
            selectionStartLineNumber,
            selectionStartColumn,
            positionLineNumber,
            positionColumn,
            startLineNumber: Math.min(selectionStartLineNumber, positionLineNumber),
            startColumn: Math.min(selectionStartColumn, positionColumn),
            endLineNumber: Math.max(selectionStartLineNumber, positionLineNumber),
            endColumn: Math.max(selectionStartColumn, positionColumn),
            start: Math.min(selection.start, selection.end),
            end: Math.max(selection.start, selection.end),
        }
    }

    function updateUserCarets(editor, users, changePackage) {
        for (const user of users) {
            user.selections = user.selections.map(selection => getUpdatedSelectionByChanges(
                editor,
                changePackage.changes,
                selection
            ));

            createCustomCursor(editor, { selections: user.selections, user });
        }
    }
}

function updateUserIcons() {
    users.textContent = "";
    fileTree.querySelectorAll("span.user-indicator")?.forEach(span => span.remove());
    for(const user of Object.values(allRoomUsers)) {
        const div = document.createElement("div");
        div.classList.toggle("inactive", user.cel === -1);
        if (!user.username) user.username = user.userId.substring(0, 3);
        div.textContent = user.username.substring(0, 15);
        div.classList.add(`user-color-${user.color}`);
        div.addEventListener("click", () => {
            const fileData = files[user.key][user.filename];
            if (!fileData) return;
            if (currentFileName !== user.filename) displayFileData(fileData);
            if (user.cel !== -1) user.scrollToCursor?.();
        })
        users.append(div);

        const parentElem = document.querySelector(`li.file[file="${user.filename}"]`);
        if (parentElem) {
            
            const span = document.createElement("span");
            span.textContent = user.username;
            span.classList.add("user-indicator", `user-color-${user.color}`)
            parentElem.append(span);
        }
    }
}

function initLocalFileInfos(key, files) {
    for(const file of Object.values(files)) {
        allUnappliedChanges[key + file.name] ??= {};
        const cells = allUnappliedChanges[key + file.name];
        cells.unappliedFileChanges ??= [];
        for(const cell of file.data.cells) {
            cells[cell.id] ??= {unappliedChanges: []};
        }
    }
}

async function loadProjectFolder() {
    fileTree.textContent = "";
    const reponse = await showDirectoryPicker({ id: "jupiter", mode: "readwrite" });
    const fileNames = {};

    for await (const entry of reponse.values()) await recurseSubFiles(entry, fileNames, "");

    return fileNames;
}

/**
 * @param {FileSystemDirectoryHandle} entry
 */
async function recurseSubFiles(entry, fileNames, path) {
    if (entry.kind == "directory") await createDirectory(entry, fileNames, path)
    else if (entry.kind == "file") await createFile(entry, fileNames, path);
}

/**
 * @param {FileSystemDirectoryHandle} directory
 */
async function createDirectory(directory, fileNames, path) {
    if (directory.name == ".git") return;
    if (directory.name == "node_modules") return;
    if (directory.name == "venv") return;
    if (directory.name == ".idea") return;

    for await (const entry of directory.values()) {
        await recurseSubFiles(entry, fileNames, `${path}/${directory.name}`);
    }

}

/**
 * @param {FileSystemFileHandle} file
 */
async function createFile(file, fileNames, path) {
    if (file.name.substring(file.name.length - 6) !== ".ipynb") return;
    const fileHandler = await file.getFile();
    const fileData = await fileHandler.text();
    const jsonData = JSON.parse(fileData);
    for(const cell of jsonData.cells) {
        if (Array.isArray(cell.source)) cell.source = cell.source.join("");
        cell.custom_modifications = 0;
        cell.id ??= generateRandomId();
    }
    const fileName = `${path}/${file.name}`;
    fileNames[fileName] = {name: fileName, data: jsonData, handler: file, lastModified: fileHandler.lastModified};
    allFileHandlers.push(fileNames[fileName]);
}

const editors = [];

function displayFileData(fileData) {
    notebook.textContent = "";
    editors.length = 0;
    currentFileName = fileData.name;
    document.querySelector("li.file.selected")?.classList.remove("selected");
    document.querySelector(`li.file[file="${fileData.name}"]`)?.classList.add("selected");

    socket.emit("caretUpdate", {cel: -1, key: fileData.key, filename: fileData.name});

    const users = Object.values(allRoomUsers).filter(caret => caret.filename === fileData.name);
    for (const cell of fileData.data.cells) {
        addCellElement(cell, fileData);

        let i = 0;
        while (i < users.length) {
            if (users[i].cel === cell.id) {
                createCustomCursor(cell.editor, { ...users[i], user: users[i] });
                users.splice(i, 1);
            } else i++;
        }
    }
}

function addCellElement(cell, fileData, cellDomPosition = {type: "append", elem: notebook}) {
    const cellContainer = document.createElement("div");
    cellContainer.classList.add("notebook-cell");
    cellContainer.classList.toggle("markdown", cell.cell_type === "markdown");

    const typeSelection = document.createElement("select");
    typeSelection.addEventListener("change", () => {
        socket.emit("cellChange", {
            type: "changeType",
            cel: cell.id,
            filename: fileData.name,
            key: fileData.key,
            newType: typeSelection.value
        });

        changeEditorLanguage(cell.editor, typeSelection.value);
        cellContainer.classList.toggle("markdown", cell.cell_type === "markdown");
    });

    const markdownOption = document.createElement("option");
    markdownOption.value = "markdown";
    markdownOption.textContent = "Markdown";
    const codeOption = document.createElement("option");
    codeOption.value = "code";
    codeOption.textContent = "Code";
    typeSelection.append(markdownOption, codeOption);
    typeSelection.value = cell.cell_type;

    const buttonContainer = document.createElement("div");
    buttonContainer.classList.add("button-container");
    const upButton = document.createElement("button");
    upButton.textContent = "Up";
    upButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "moveUp", cel: cell.id, filename: fileData.name, key: fileData.key});
    });
    const downButton = document.createElement("button");
    downButton.textContent = "Down";
    downButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "moveDown", cel: cell.id, filename: fileData.name, key: fileData.key});
    });

    const addButton = document.createElement("button");
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "add", cel: cell.id, filename: fileData.name, key: fileData.key});
    });
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "delete", cel: cell.id, filename: fileData.name, key: fileData.key});
    });
    buttonContainer.append(upButton, downButton, addButton, deleteButton);

    function addElementToDom(cellDomPosition, cellElement) {
        if (cellDomPosition.type === "append") cellDomPosition.elem.append(cellElement);
        if (cellDomPosition.type === "prepend") cellDomPosition.elem.prepend(cellElement);
        if (cellDomPosition.type === "after") cellDomPosition.elem.after(cellElement);
        if (cellDomPosition.type === "before") cellDomPosition.elem.before(cellElement);
    }
    
    if (cell.editor) {
        cellContainer.append(typeSelection, cell.editor.getContainerDomNode(), buttonContainer);
        addElementToDom(cellDomPosition, cellContainer);
        resizeAllEditors();
    } else {
        const editorContainer = document.createElement("div");
        editorContainer.classList.add("editor-container");
        cellContainer.append(typeSelection, editorContainer, buttonContainer);
        addElementToDom(cellDomPosition, cellContainer);

        editorContainer.addEventListener("wheel", e => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, {capture: true});

        const editor = monaco.editor.create(editorContainer, {
            value: cell.source,
            language: cell.cell_type === "code" ? "python" : "markdown",
            theme: "vs-dark",
            scrollBeyondLastLine: false,
            wordWrap: true,
            minimap: {
                enabled: false
            },
            hover: {
                enabled: false
            },
            padding: {
                top: 10,
                bottom: 10
            }
        });

        editor.onDidChangeModelContent(changes => {
            if(changes.isFlush) return;

            changeInsideCell2(fileData.key, fileData.name, cell.id, changes)
        });

        editor.onDidChangeCursorSelection(selection => {
            if (selection.reason === 1) return

            const selections = editor.getSelections();

            socket.emit("caretUpdate", {
                selections,
                cel: cell.id,
                key: fileData.key,
                filename: fileData.name,
                username: username.value
            });
        });

        editor.onDidFocusEditorText(() => {
            currentCelId = cell.id;
        });

        editor.onDidBlurEditorText(() => {
            editor.setSelection({
                positionColumn: 0,
                positionLineNumber: 0,
                selectionStartColumn: 0,
                selectionStartLineNumber: 0,
            });
            currentCelId = -1;
            socket.emit("caretUpdate", {
                cel: -1,
                key: fileData.key,
                filename: fileData.name,
                username: username.value
            });
        });

        editor.onDidContentSizeChange(() => {
            editor.layout({
                width: editorContainer.clientWidth,
                height: editor.getContentHeight()
            });
        })

        cell.editor = editor;
    }

    updateOutputFromCellElem(cellContainer, cell);
    
    editors.push(cell.editor);

    // const cellContainer = createCellElement(fileData, cell);
    // notebook.append(cellContainer);
    // // const textArea = cellContainer.querySelector("textarea")
    // // setTimeout(() => updateTextAreaHeight(textArea), 100);
    // // updateTextAreaHeight(textArea);

    // if(users.find(u => u.cel === cell.id)) {
    //     updateUserCaretElement({cel: cell.id}, cell.source, i);
    // }
}

function updateOutputFromCellElem(cellElement, cellData) {
    cellElement.querySelector("details")?.remove();

    if (cellData.outputs?.length) {
        const outputContainer = document.createElement("details");
        outputContainer.classList.add("outputContainer")
        outputContainer.setAttribute("open", "")
        const summary = document.createElement("summary");
        summary.textContent = "Hide output";
        outputContainer.append(summary);
        for (const { text, data } of cellData.outputs) {
            if (data) {
                if ("image/png" in data) {
                    const img = document.createElement("img");
                    img.src = `data:image/png;base64,${data["image/png"]}`;
                    outputContainer.append(img);
                }
                else if ("text/html" in data) {
                    const outputContent = document.createElement("div");
                    if (Array.isArray(data["text/html"])) outputContent.innerHTML = data["text/html"].join("");
                    else outputContent.innerHTML = data["text/html"];
                    outputContainer.append(outputContent);
                }
                else if ("text/plain" in data) {
                    const pre = document.createElement("pre");
                    if (Array.isArray(data["text/plain"])) pre.textContent = data["text/plain"].join("");
                    else pre.textContent = data["text/plain"];
                    outputContainer.append(pre)
                }
            } else if (text) {
                const pre = document.createElement("pre");
                if (Array.isArray(text)) pre.textContent = text.join("");
                else pre.textContent = text;
                outputContainer.append(pre)
            }
        }
        cellElement.append(outputContainer)
    }
}

function updateTextAreaHeight(textarea) {
    textarea.style.height = "0px";
    textarea.style.height = textarea.scrollHeight + 2 + "px";
}

function jsonDataCopyForServer(filesData) {
    const clone = structuredClone(filesData);
    for (const fileData of Object.values(clone)) {
        delete fileData.handler;
        delete fileData.key;
        delete fileData.lastModified;
        fileData.data.cells.forEach(row => {
            delete row["metadata"];
            delete row["execution_count"];
            delete row["outputs"];
        });
    }

    return clone;
}

async function writeJsonDataToUserFile(fileData) {
    if(!fileData.handler) {
        fileData.handler = await showSaveFilePicker();
        const fileHandler = await fileData.handler.getFile();
        fileData.lastModified = fileHandler.lastModified;
        allFileHandlers.push(fileData);
    }

    const clone = {
        ...fileData.data,
        cells: fileData.data.cells.map(({
            custom_modifications,
            editor,
            cell_type,
            execution_count,
            id,
            metadata,
            outputs,
            source,
            ...cell
        }) => {
            return {
                "cell_type": cell_type ?? "code",
                "execution_count": execution_count ?? null,
                "id": id ?? generateRandomId(),
                "metadata": metadata ?? {},
                "outputs": outputs ?? [],
                source: formatSource(source),
                ...cell,
            };
        })
    };

    function formatSource(source) {
        if (source.length === 0) return [];
        return source.split("\n").map((v, i, arr) => i === arr.length - 1 ? v : v + "\n")
    }

    const stream = await fileData.handler.createWritable();
    await stream.write(JSON.stringify(clone, null, 1));
    const file = await fileData.handler.getFile();
    fileData.lastModified = file.lastModified;
    await stream.close();

    const extensionJupiterlabReload = document.querySelector("#jupiterlabReload");
    if (extensionJupiterlabReload?.checked) {
        document.querySelector("#reloadJupiterlab")?.click();
    }

    if (typeof reloadJupiterlabExtension !== "undefined") reloadJupiterlabExtension();
}

function changeInsideCell(key, filename, cellId, beforeEditText, editedText) {
    if (beforeEditText === editedText) return;

    const cell = files[key][filename].data.cells.find(v => v.id === cellId);
    const change = {key, cel: cellId, filename, custom_modifications: cell.custom_modifications};
    const unappliedChanges = allUnappliedChanges[key + filename][cellId].unappliedChanges;

    let firstUnchangedChar = -1;
    let lastUnchangedChar = -1;

    for(let x = 0; x < beforeEditText.length; x++) {
        if (beforeEditText[x] !== editedText[x]) break;
        firstUnchangedChar = x;
    }

    for (let x = 1; x < beforeEditText.length; x++) {
        if (beforeEditText.at(-x) !== editedText.at(-x) || x + firstUnchangedChar === editedText.length) break;
        lastUnchangedChar = x - 1;
    }

    if (firstUnchangedChar === -1 && lastUnchangedChar === -1) {
        // console.log("If change: 1 done")
        change.start = 0;
        change.end = beforeEditText.length;
        change.data = editedText;
    } else if (firstUnchangedChar === -1) {
        // console.log("If change: 2 and 3 done")
        change.start = 0;
        change.end = beforeEditText.length - 1 - lastUnchangedChar;
        change.data = editedText.substring(0, editedText.length - 1 - lastUnchangedChar);
    } else if (lastUnchangedChar === -1) {
        // console.log("If change: 4 and 5 done")
        change.start = firstUnchangedChar + 1;
        change.end = beforeEditText.length;
        change.data = editedText.substring(firstUnchangedChar + 1);
    } else {
        // console.log("If change: 6 and 7 done");
        change.start = firstUnchangedChar + 1;
        change.end = beforeEditText.length - lastUnchangedChar - 1;
        change.data = editedText.substring(firstUnchangedChar + 1, editedText.length - lastUnchangedChar - 1);
    }
    // console.log(firstUnchangedChar, lastUnchangedChar);
    // console.log({start: firstUnchangedChar, end: lastUnchangedChar})

    // console.log(JSON.stringify(change, (key, val) => {
    //     if (key === "filename") return undefined;
    //     if (key === "cel") return undefined;
    //     if (key === "custom_modifications") return undefined;
    //     if (key === "key") return undefined;
    //     return val;
    // }));

    const advancedClone = structuredClone(unappliedChanges);
    for(let i = 1; i < advancedClone.length; i++) {
        for(let j = 0; j < i; j++) {
            advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
        }
    }

    advancedClone.forEach(change => {
        delete change.stop;
        delete change.replaceEnd;
    });

    let revertedChange = structuredClone(change);
    for(let i = advancedClone.length - 1; i >= 0; i--) {
        revertedChange = revertChangeBackward(advancedClone[i], revertedChange);
    }

    unappliedChanges.push(revertedChange);
    
    socket.emit("changeFile", revertedChange);
}

function changeInsideCell2(key, filename, cellId, vscodeChanges) {
    const cell = files[key][filename].data.cells.find(v => v.id === cellId);
    const unappliedChanges = allUnappliedChanges[key + filename][cellId].unappliedChanges;

   
    
    const changes = vscodeChanges.changes.map(change => {
        return {
            start: change.rangeOffset,
            end: change.rangeOffset + change.rangeLength,
            data: change.text
        };
        // changeBase.start = change.rangeOffset;
        // changeBase.end = change.rangeOffset + change.rangeLength;
        // changeBase.data = 
    });

    const advancedClone = structuredClone(unappliedChanges.map(v => v.changes).flat());
    for(let i = 1; i < advancedClone.length; i++) {
        for(let j = 0; j < i; j++) {
            // console.log(advancedClone, advancedClone[j], advancedClone[i])
            advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
        }
    }

    advancedClone.forEach(change => {
        delete change.stop;
        delete change.replaceEnd;
    });

    let revertedChanges = structuredClone(changes);
    for(let i = advancedClone.length - 1; i >= 0; i--) {
        for(let j = 0; j < revertedChanges.length; j++) {
            revertedChanges[j] = revertChangeBackward(advancedClone[i], revertedChanges[j]);
        }
    }

    const changePackage = {key, cel: cellId, filename, custom_modifications: cell.custom_modifications, changes: revertedChanges};

    unappliedChanges.push(changePackage);
    
    socket.emit("changeFile", changePackage);
}



function advanceChangeForward(oldChange, change) {
    const clone = structuredClone(change);
    const oldDelta = oldChange.end - oldChange.start;
    const curDelta = clone.end - clone.start;
    const oldMovement = oldChange.data.length - oldDelta;
    const curMovement = clone.data.length - curDelta;
    const oldMaxX = Math.max(oldChange.end, oldChange.start + oldChange.data.length);
    const curMaxX = Math.max(clone.end, clone.start + clone.data.length);

    // console.log(oldChange, change);

    if (oldMovement === 0) {
        // console.log("Advanced 0: ")
        return clone;
    } else if (oldChange.end <= clone.start && !clone.stop) {
        // console.log("Advanced 1: ")
        clone.start += oldMovement;
        clone.end += oldMovement;
    } else if (oldChange.start >= clone.end && !clone.replaceEnd) {
        // console.log("Advanced 2: ")
        return clone;
    } else if (clone.start <= oldChange.start && clone.end >= oldChange.end) {
        // console.log("Advanced 3: ")
        clone.end += oldMovement;
    } else if (true) {
        console.error("Advanced 4: ")
    } else if (true) {
        console.error("Advanced 5: ")
    } else if (true) {
        console.error("Advanced 6: ")
    } else if (true) {
        console.error("Advanced 7: ")
    } else if (true) {
        console.error("Advanced 8: ")
    } else if (true) {
        console.error("Advanced 9: ")
    } else if (true) {
        console.error("Advanced 10: ")
    }

    return clone
}


function revertChangeBackward(oldChange, change) {
    const clone = structuredClone(change);
    const oldDelta = oldChange.end - oldChange.start;
    const curDelta = clone.end - clone.start;
    const oldMovement = oldChange.data.length - oldDelta;
    const curMovement = clone.data.length - curDelta;
    const oldMaxX = Math.max(oldChange.end, oldChange.start + oldChange.data.length);
    const curMaxX = Math.max(clone.end, clone.start + clone.data.length);
    // const currentMaxX = Math.max(clone.end, clone.start + clone.data.length);
    // const charMovement = oldChange.data.length - (oldChange.end - oldChange.start);

    // console.log(oldChange, change);

    if (oldMovement === 0) {
        // console.log("Revert 0: ")
        return clone;
    } else if (oldChange.end <= clone.start - oldMovement) {
        // console.log("Revert 1: ")
        clone.start -= oldMovement;
        clone.end -= oldMovement;
    } else if (oldChange.start >= clone.end) {
        if (oldChange.end === clone.start) clone.stop = true;
        // console.log("Revert 2: ")
        return clone;
    } else if (clone.start <= oldChange.start && clone.end - oldMovement >= oldChange.end) {
        // console.log("Revert 3: ")
        clone.end -= oldMovement;
        if (oldChange.end === clone.start) clone.stop = true;
        if (oldChange.end === clone.end) clone.replaceEnd = true;
    } else if (true) {
        console.error("Revert 4: ")
    } else if (true) { {

        if (oldChange.end === clone.end) clone.replaceEnd = true;
    }
        console.error("Revert 5: ")
    } else if (true) {
        console.error("Revert 6: ")
    }  else if (true) {
        console.error("Revert 7: ")
    } else if (true) {
        console.error("Revert 8: ")
    } else if (true) {
        console.error("Revert 9: ")
    } else if (true) {
        console.error("Revert 10: ")
    }

    return clone
}

function changeEditorText(editor, source, rootChangesPackages) {
    // console.log("Change pre element", rootChanges);

    const advancedClone = structuredClone(rootChangesPackages.map(rootPackage => rootPackage.changes).flat());
    for(let i = 1; i < advancedClone.length; i++) {
        for(let j = 0; j < i; j++) {
            advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
        }
    }

    if (rootChangesPackages[0]?.filename !== currentFileName) return;

    for(const change of advancedClone) {
        // if(newText === null) {
        //     const fileData = files[change.key][change.filename];
        //     cellNum = fileData.data.cells.findIndex(v => v.id === change.cel);
        //     newText = fileData.data.cells[cellNum].source;
        // }
        source = source.substring(0, change.start) + change.data + source.substring(change.end);
    }

    // if(cellNum === -1) return;
    // const textarea = notebook.querySelectorAll("textarea")[cellNum];
    // const selectionStart = textarea.selectionStart;
    // const selectionEnd = textarea.selectionEnd;
    // const selectionDirection = textarea.selectionDirection;
    // textarea.value = newText;
    const selection = editor.getSelections();
    editor.setValue(source);
    editor.setSelections(selection);
    // textarea.selectionStart = selectionStart;
    // textarea.selectionEnd = selectionEnd;
    // textarea.selectionDirection = selectionDirection;
    // updateTextAreaHeight(textarea);
    // updateCodeHighlight(notebook.querySelectorAll(".cell")[cellNum]);
}

(() => {
    const text = "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)";

    // Case 0
    test(
        "X_tr123, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":4,"end":5,"data":"1"},
            {"start":5,"end":6,"data":"2"},
            {"start":6,"end":7,"data":"3"},
        ],
        [
            {"start":4,"end":5,"data":"1"},
            {"start":5,"end":6,"data":"2"},
            {"start":6,"end":7,"data":"3"},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = train_5555555555(X, y, test_size=0.2, random_state=42)",
        [
            {"start":44,"end":47,"data":"123"},
            {"start":43,"end":48,"data":"44444"},
            {"start":41,"end":51,"data":"5555555555"},
        ],
        [
            {"start":44,"end":47,"data":"123"},
            {"start":43,"end":48,"data":"44444"},
            {"start":41,"end":51,"data":"5555555555"},
        ]
    );

    // Case 1
    test(
        ", , , y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":0,"end":7,"data":""},
            {"start":2,"end":8,"data":""},
            {"start":4,"end":11,"data":""},
        ],
        [
            {"start":0,"end":7,"data":""},
            {"start":9,"end":15,"data":""},
            {"start":17,"end":24,"data":""},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = _split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":35,"end":36,"data":""},
            {"start":35,"end":36,"data":""},
            {"start":35,"end":43,"data":""},
        ],
        [
            {"start":35,"end":36,"data":""},
            {"start":36,"end":37,"data":""},
            {"start":37,"end":45,"data":""},
        ]
    );
    test(
        "123, 456, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":0,"end":7,"data":"123"},
            {"start":5,"end":8,"data":"4"},
            {"start":6,"end":9,"data":"56"},
        ],
        [
            {"start":0,"end":7,"data":"123"},
            {"start":9,"end":12,"data":"4"},
            {"start":12,"end":15,"data":"56"},
        ]
    );
    test(
        "X_train123, X_test456, y_train789, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":7,"end":7,"data":"123"},
            {"start":18,"end":18,"data":"456"},
            {"start":30,"end":30,"data":"789"},
        ],
        [
            {"start":7,"end":7,"data":"123"},
            {"start":15,"end":15,"data":"456"},
            {"start":24,"end":24,"data":"789"},
        ]
    );
    test(
        "X_train123, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":7,"end":7,"data":"1"},
            {"start":8,"end":8,"data":"2"},
            {"start":9,"end":9,"data":"3"},
        ],
        [
            {"start":7,"end":7,"data":"1"},
            {"start":7,"end":7,"data":"2"},
            {"start":7,"end":7,"data":"3"},
        ]
    );
    test(
        "X_tra123, X_456789, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":5,"end":7,"data":"123"},
            {"start":12,"end":14,"data":"456"},
            {"start":15,"end":17,"data":"789"},
        ],
        [
            {"start":5,"end":7,"data":"123"},
            {"start":11,"end":13,"data":"456"},
            {"start":13,"end":15,"data":"789"},
        ]
    );

    // Case 2
    test(
        ", , , y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":17,"end":24,"data":""},
            {"start":9,"end":15,"data":""},
            {"start":0,"end":7,"data":""},
        ],
        [
            {"start":17,"end":24,"data":""},
            {"start":9,"end":15,"data":""},
            {"start":0,"end":7,"data":""},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = train_test(X, y, test_size=0.2, random_state=42)",
        [
            {"start":50,"end":51,"data":""},
            {"start":46,"end":50,"data":""},
            {"start":45,"end":46,"data":""},
        ],
        [
            {"start":50,"end":51,"data":""},
            {"start":46,"end":50,"data":""},
            {"start":45,"end":46,"data":""},
        ]
    );
    test(
        "X_train, X_test, y_train, 33y_test = 2222train_111111test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":41,"data":"111111"},
            {"start":35,"end":35,"data":"2222"},
            {"start":26,"end":26,"data":"33"},
        ],
        [
            {"start":41,"end":41,"data":"111111"},
            {"start":35,"end":35,"data":"2222"},
            {"start":26,"end":26,"data":"33"},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = 321train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":35,"end":35,"data":"1"},
            {"start":35,"end":35,"data":"2", "stop": true},
            {"start":35,"end":35,"data":"3", "stop": true},
        ],
        [
            {"start":35,"end":35,"data":"1"},
            {"start":35,"end":35,"data":"2", "stop": true},
            {"start":35,"end":35,"data":"3", "stop": true},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = 789456123train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":35,"end":35,"data":"123"},
            {"start":35,"end":35,"data":"456", stop: true},
            {"start":35,"end":35,"data":"789", stop: true},
        ],
        [
            {"start":35,"end":35,"data":"123"},
            {"start":35,"end":35,"data":"456", stop: true},
            {"start":35,"end":35,"data":"789", stop: true},
        ]
    );
    
    // Case 3
    test(
        "X_train, X_test, y_train, y_test = trai2222t(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":45,"data":"1"},
            {"start":39,"end":47,"data":"2222"},
        ],
        [
            {"start":41,"end":45,"data":"1"},
            {"start":39,"end":50,"data":"2222"},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = train_2222t(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":45,"data":"1"},
            {"start":41,"end":47,"data":"2222"},
        ],
        [
            {"start":41,"end":45,"data":"1"},
            {"start":41,"end":50,"data":"2222"},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = t2222_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":45,"data":"1"},
            {"start":36,"end":42,"data":"2222", replaceEnd: true},
        ],
        [
            {"start":41,"end":45,"data":"1"},
            {"start":36,"end":45,"data":"2222", replaceEnd: true},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = trai222222222222st_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":39,"end":50,"data":"222222222222"},
        ],
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":39,"end":43,"data":"222222222222"},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = train_222222222222st_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":41,"end":50,"data":"222222222222", stop: true},
        ],
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":41,"end":43,"data":"222222222222", stop: true},
        ]
    );
    test(
        "X_train, X_test, y_train, y_test = 22222222222222222test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":35,"end":48,"data":"22222222222222222", replaceEnd: true},
        ],
        [
            {"start":41,"end":41,"data":"1111111"},
            {"start":35,"end":41,"data":"22222222222222222", replaceEnd: true},
        ]
    );

    function test(finalText, advancedChanges, rootChanges) {
        let cur = text;
        for(const change of advancedChanges) {
            cur = cur.substring(0, change.start) + change.data + cur.substring(change.end);
        }

        if (cur !== finalText) console.error("Advanced values are wrong");

        const revertedClone = structuredClone(advancedChanges);
        for(let i = revertedClone.length - 1; i > 0; i--) {
            for(let j = i - 1; j >= 0; j--) {
                revertedClone[i] = revertChangeBackward(revertedClone[j], revertedClone[i]);
            }
        }

        if (JSON.stringify(revertedClone) !== JSON.stringify(rootChanges)) {
            console.log("%cRoot convertion failed", "background: red;color:white");
            console.log("Wrong: ", revertedClone);
            console.log("Right: ", rootChanges);
        } else console.log("%cRevert passed", "background: green;color:white");

        const advancedClone = structuredClone(rootChanges);
        for(let i = 1; i < advancedClone.length; i++) {
            for(let j = 0; j < i; j++) {
                advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
            }
        }

        if (JSON.stringify(advancedClone) !== JSON.stringify(advancedChanges)) {
            console.log("%cAdvanced convertion failed", "background: red;color:white");
            console.log("Wrong: ", advancedClone);
            console.log("Right: ", advancedChanges);
        } else console.log("%cAdvanced passed", "background: green;color:white");
    }
});

Object.assign(globalThis.String.prototype, {
    str: function(change) {
        return this.substring(0, change.start) + change.data + this.substring(change.end);
    }
})