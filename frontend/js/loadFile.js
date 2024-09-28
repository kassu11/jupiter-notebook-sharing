import socketIO from "socket.io-client";
import {api} from "./api";
const loadButton = document.querySelector("#openProjectFolder");
const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");
const lag = document.querySelector("#lag");

const files = {};
const allFileHandlers = [];
const allUnappliedChanges = {};
let currentFileName = "";
let currentKey = "";
let selectionStart = 0;
let selectionEnd = 0;
let selectionDirection = "forward";
let currentCelNumber = -1;

const allRoomUsers = {};

const socket = socketIO("https://jupiter-notebook-sharing.onrender.com/", {
    auth: (token) => {
        token({ token: "access" });
    }
});

window.addEventListener("resize", () => {
    document.querySelectorAll("textarea").forEach(updateTextAreaHeight);
});
window.addEventListener("keydown", async (event) => {
    if (event.ctrlKey && event.code === "KeyS") {
        event.preventDefault();
        const fileData = files[currentKey]?.[currentFileName];
        if (fileData) {
            await writeJsonDataToUserFile(fileData);
        }
    }
})

setInterval(async () => {
    for(const fileData of allFileHandlers) {
        const file = await fileData.handler.getFile();
        if (file.lastModified !== fileData.lastModified) {
            fileData.lastModified = file.lastModified;
            const fileText = await file.text();
            const jsonData = JSON.parse(fileText);

            const localCells = [...fileData.data.cells];
            const fileCells = [...jsonData.cells];

            let i = 0;
            main: while(i < localCells.length) {
                if (localCells[i]?.merge_id == null) continue;
                for(let j = 0; j < fileCells.length; j++) {
                    if (localCells[i]?.merge_id === fileCells[j]?.merge_id) {
                        localCells[i].metadata = fileCells[j].metadata;
                        localCells[i].cell_type = fileCells[j].cell_type;
                        localCells[i].outputs = fileCells[j].outputs;
                        localCells[i].execution_count = fileCells[j].execution_count;
                        if (Array.isArray(fileCells[j].source)) fileCells[j].source = fileCells[j].source.join("");

                        changeInsideCell(
                            fileData.key,
                            fileData.name,
                            localCells[i].merge_id,
                            localCells[i].source,
                            fileCells[j].source
                        )

                        fileCells.splice(j, 1);
                        localCells.splice(i, 1);
                        continue main;
                    }

                }
                
                console.log("merge id not found: ", localCells[0]);
                i++;
            }

            console.log(fileData.name, file.lastModified);
        }
    }
}, 100);


lag.addEventListener("click", async e => {
    socket.emit("lag", "data")
});

host.addEventListener("click", async () => {
    const key = prompt("Set custom room key");
    const filesData = await loadProjectFolder();
    files[key] = filesData;

    for(const value of Object.values(filesData)) {
        value.key = key;
    }

    await api.hostFiles({
        fileData: jsonDataCopyForServer(filesData), 
        key, 
        id: socket.id
    });

    initLocalFileInfos(key, filesData);
    socketJoin(key);
});

join.addEventListener("click", async e => {
    const roomKey = prompt("Enter room key");

    const fetchedFiles = await api.getLoadedFiles({key: roomKey});
    files[roomKey] = fetchedFiles.files;
    for(const value of Object.values(fetchedFiles.files)) {
        value.key = roomKey;
    }
    const fileTreeObject = {};

    for(const file of Object.values(fetchedFiles.files)) {
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
                li.textContent = key;
                li.classList.add("file");
                parentUl.append(li);
                li.addEventListener("click", () => displayFileData(files[roomKey][value.fullFileName]));
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

    console.log(files)

    console.log(fetchedFiles, Object.entries(fileTreeObject));

    initLocalFileInfos(roomKey, fetchedFiles.files);
    socketJoin(roomKey);
});

function socketJoin(key) {

    socket.on(`caretUpdate${key}`, caretUpdate);
    function caretUpdate(caret) {
        const oldCaret = allRoomUsers[caret.userId];
        allRoomUsers[caret.userId] = caret;
        const oldIndex = oldCaret == null ? -1 : files[key][caret.filename].data.cells.findIndex(row => row.merge_id === oldCaret.cel);
        const curIndex = files[key][caret.filename].data.cells.findIndex(row => row.merge_id === caret.cel);
        if (currentFileName !== caret.filename) return;
        
        if (oldIndex !== -1 && oldIndex !== curIndex) {
            const text = files[oldCaret.key][oldCaret.filename].data.cells[oldIndex].source;
            updateUserCaretElement(oldCaret, text, oldIndex);
        }

        const text = files[key][caret.filename].data.cells[curIndex].source;
        updateUserCaretElement(caret, text, curIndex);
    }

    function updateUserCaretElement(caret, text, cellIndex) {
        const caretPre = document.querySelectorAll(".cell .userCarets")[cellIndex];
        caretPre.textContent = "";
        const allCellUsers = Object.values(allRoomUsers).filter(user => user.cel === caret.cel)
            .map(user => ({
                ...user, 
                min: Math.min(user.selectionStart, user.selectionEnd), 
                max: Math.max(user.selectionStart, user.selectionEnd),
            }));
        if(allCellUsers.length === 0) return;
        const bitArray = Array(text.length).fill(0);
        allCellUsers.forEach((user, i) => {
            const mask = 1<<parseInt(i);
            if (user.min == user.max) bitArray[user.min] |= mask;
            for(let j = user.min; j < user.max; j++) {
                bitArray[j] |= mask;
            }
        });

        let start = 0;
        for(let i = 0; i <= bitArray.length; i++) {
            if (bitArray[i] === bitArray[i + 1] && i !== bitArray.length) continue;

            let curSpan = caretPre;
            allCellUsers.forEach((caret, j) => {
                const mask = 1<<parseInt(j);
                if ((bitArray[i] & mask) !== mask) return;
                const span = document.createElement("span");
                // span.style.background = "#ff00004f";
                curSpan.append(span);
                curSpan = span;
                // console.log(i, start, caret)
                if (caret.min === caret.max) {
                    span.classList.add("backward", "noFill");
                } else if(i + 1 === caret.max && caret.selectionDirection == "forward") {
                    span.classList.add("forward");
                } else if(start === caret.min && caret.selectionDirection == "backward") {
                    span.classList.add("backward");
                }
            });

            curSpan.append(document.createTextNode(text.substring(start, i + 1)));
            start = i + 1;
        }

    }

    socket.on(`cellChange${key}`, change => {
        const unappliedChanges = allUnappliedChanges[key + change.filename]
        const [unappliedChange] = unappliedChanges.unappliedFileChanges;
        const domAlreadyUpdated = JSON.stringify(change) === JSON.stringify(unappliedChange);
        const fileActive = currentFileName === change.filename;
        if (domAlreadyUpdated) {
            unappliedChanges.unappliedFileChanges.shift();
        }

        const fileData = files[change.key][change.filename];
        const cellIndex = fileData.data.cells.findIndex(v => v.merge_id === change.cel);

        if (change.type === "delete") {
            fileData.data.cells.splice(cellIndex, 1);
            if (fileActive) {
                document.querySelectorAll(".cell")[cellIndex].remove();
            }
        } else if (change.type === "add") {
            if (fileActive) {
                const cellContainer = createCellElement(fileData, change.data);
                document.querySelectorAll(".cell")[cellIndex].after(cellContainer);
                updateTextAreaHeight(cellContainer.querySelector("textarea"));
                
            }
            fileData.data.cells.splice(cellIndex + 1, 0, change.data);
            initLocalFileInfos(key, [fileData]);
        } else if (change.type === "moveUp") {
            if (fileActive) {
                const nextCell = document.querySelectorAll(".cell")[cellIndex - 1];
                const current = document.querySelectorAll(".cell")[cellIndex];
                const activeCellElem = document.activeElement?.closest(".cell");

                if(activeCellElem === current) current.after(nextCell);
                else nextCell.before(current);
            }
            [fileData.data.cells[cellIndex - 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex - 1]]
        } else if (change.type === "moveDown") {
            if (fileActive) {
                const prevCell = document.querySelectorAll(".cell")[cellIndex + 1];
                const current = document.querySelectorAll(".cell")[cellIndex];
                const activeCellElem = document.activeElement?.closest(".cell");
                
                if(activeCellElem === current) current.before(prevCell);
                else prevCell.after(current);
            }

            [fileData.data.cells[cellIndex + 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex + 1]]
        } else if(change.type === "changeType") {
            fileData.data.cells[cellIndex].cell_type = change.newType;
            if (fileActive) {
                const cellElem = document.querySelectorAll(".cell")[cellIndex];
                cellElem.querySelector("select").value = change.newType;
            }
        }
    });

    socket.on(`fileUpdates${key}`, change => {
        const unappliedChanges = allUnappliedChanges[key + change.filename][change.cel].unappliedChanges;
        let needToUpdateCaret = change.cel === currentCelNumber && currentFileName === change.filename;
        if(unappliedChanges.length) {
            const removeUserId = (key, val) => key === "userId" ? undefined : val;
            if (JSON.stringify(change, removeUserId) === JSON.stringify(unappliedChanges[0])) {
                unappliedChanges.shift();
                needToUpdateCaret = false;
            }
        }

        const currentTextarea = document.querySelectorAll("textarea")[currentCelNumber];
        const start = currentTextarea?.selectionStart;
        const end = currentTextarea?.selectionEnd;
        const dir = currentTextarea?.selectionDirection;
        changeTextarea([change, ...unappliedChanges]);
        if (needToUpdateCaret) updateCaret(change, start, end, dir);
        if (currentFileName === change.filename) updateUserCarets(change);
        
        for(let i = 0; i < unappliedChanges.length; i++) {
            unappliedChanges[i] = advanceChangeForward(change, unappliedChanges[i]);
            unappliedChanges[i].id++;
        }

        const fileData = files[change.key][change.filename];
        const cellIndex = fileData.data.cells.findIndex(v => v.merge_id === change.cel);
        const cell = fileData.data.cells[cellIndex];
        const sourceText = cell.source;
        cell.source = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
        cell.id++;

        if (needToUpdateCaret) {
            caretUpdate({
                ...change,
                selectionDirection: "forward",
                selectionEnd: change.start,
                selectionStart: change.start,
            });
        } else updateUserCaretElement(change, cell.source, cellIndex);

    });

    function updateUserCarets(change) {
        const delta = change.data.length - (change.end - change.start);
        for(const caret of Object.values(allRoomUsers)) {
            if (caret.cel !== change.cel || caret.key !== change.key || caret.filename !== change.filename) continue;

            if (change.end <= caret.selectionStart) caret.selectionStart += delta;
            if (change.end <= caret.selectionEnd) caret.selectionEnd += delta;
        }
    }

    function updateCaret(change, start, end, dir) {
        const textarea = document.querySelectorAll("textarea")[currentCelNumber];
        const delta = change.data.length - (change.end - change.start);
        if (change.end <= start) textarea.selectionStart = start + delta;
        if (change.end <= end) textarea.selectionEnd = end + delta;
        textarea.selectionDirection = dir;

        selectionStart = textarea.selectionStart;
        selectionEnd = textarea.selectionEnd;
        selectionDirection = textarea.selectionDirection;
    }
}



function initLocalFileInfos(key, files) {
    for(const file of Object.values(files)) {
        allUnappliedChanges[key + file.name] ??= {};
        const cells = allUnappliedChanges[key + file.name];
        cells.unappliedFileChanges ??= [];
        for(const cell of file.data.cells) {
            cells[cell.merge_id] ??= {unappliedChanges: []};
        }
    }
}

loadButton.addEventListener("click", loadProjectFolder);

async function loadProjectFolder() {
    fileTree.textContent = "";
    const reponse = await showDirectoryPicker({ id: "jupiter", mode: "readwrite" });
    const fileNames = {};

    for await (const entry of reponse.values()) await recurseSubFiles(entry, fileTree, fileNames, "");

    return fileNames;
}

/**
 * @param {FileSystemDirectoryHandle} entry
 */
async function recurseSubFiles(entry, parentUl, fileNames, path) {
    if (entry.kind == "directory") await createDirectory(entry, parentUl, fileNames, path)
    else if (entry.kind == "file") await createFile(entry, parentUl, fileNames, path);
}

/**
 * @param {FileSystemDirectoryHandle} directory
 */
async function createDirectory(directory, parentUl, fileNames, path) {
    if (directory.name == ".git") return;
    if (directory.name == "node_modules") return;
    if (directory.name == "venv") return;
    if (directory.name == ".idea") return;

    const li = document.createElement("li");
    li.textContent = directory.name;
    const ul = document.createElement("ul");
    li.append(ul);
    parentUl.append(li);

    for await (const entry of directory.values()) {
        await recurseSubFiles(entry, ul, fileNames, `${path}/${directory.name}`);
    }

}

/**
 * @param {FileSystemFileHandle} file
 */
async function createFile(file, parentUl, fileNames, path) {
    if (file.name.substring(file.name.length - 6) !== ".ipynb") return;
    const fileHandler = await file.getFile();
    const fileData = await fileHandler.text();
    const jsonData = JSON.parse(fileData);
    let i = 0;
    for(const cell of jsonData.cells) {
        if (Array.isArray(cell.source)) cell.source = cell.source.join("");
        cell.id = 0;
        cell.merge_id = i++;
    }
    const fileName = `${path}/${file.name}`;
    fileNames[fileName] = {name: fileName, data: jsonData, handler: file, lastModified: fileHandler.lastModified};
    allFileHandlers.push(fileNames[fileName]);
    const li = document.createElement("li");
    li.classList.add("file", "real");
    li.textContent = file.name;
    li.addEventListener("click", () => displayFileData(fileNames[fileName]));
    parentUl.append(li);
}

function displayFileData(fileData) {
    notebook.textContent = "";
    currentFileName = fileData.name;
    currentKey = fileData.key;
    for (const cell of fileData.data.cells) {
        const cellContainer = createCellElement(fileData, cell);
        notebook.append(cellContainer);
        const textArea = cellContainer.querySelector("textarea")
        setTimeout(() => updateTextAreaHeight(textArea), 100);
        updateTextAreaHeight(textArea);
    }
}

function createCellElement(fileData, cellData) {
    const cellContainer = document.createElement("div");
    cellContainer.classList.add("cell");

    const typeSelection = document.createElement("select");
    typeSelection.addEventListener("change", () => {
        socket.emit("cellChange", {
            type: "changeType",
            cel: cellData.merge_id,
            filename: fileData.name,
            key: fileData.key,
            newType: typeSelection.value
        });
    })
    const markdownOption = document.createElement("option");
    markdownOption.value = "markdown";
    markdownOption.textContent = "Markdown";
    const codeOption = document.createElement("option");
    codeOption.value = "code";
    codeOption.textContent = "Code";
    typeSelection.append(markdownOption, codeOption);
    typeSelection.value = cellData.cell_type;

    const buttonContainer = document.createElement("div");
    buttonContainer.classList.add("buttonContainer");
    const upButton = document.createElement("button");
    upButton.textContent = "Up";
    upButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "moveUp", cel: cellData.merge_id, filename: fileData.name, key: fileData.key});
    });
    const downButton = document.createElement("button");
    downButton.textContent = "Down";
    downButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "moveDown", cel: cellData.merge_id, filename: fileData.name, key: fileData.key});
    });

    const addButton = document.createElement("button");
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "add", cel: cellData.merge_id, filename: fileData.name, key: fileData.key});
    });
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
        socket.emit("cellChange", {type: "delete", cel: cellData.merge_id, filename: fileData.name, key: fileData.key});
    });
    buttonContainer.append(upButton, downButton, addButton, deleteButton);
     
    const textareaContainer = document.createElement("div");
    textareaContainer.classList.add("textContainer");
    const pre = document.createElement("pre");
    pre.classList.add("userCarets");
    const textarea = createTextArea(cellData.merge_id, fileData);
    textarea.value = cellData.source;
    textareaContainer.append(pre, textarea);

    let textBeforeInput = "";
    textarea.addEventListener("beforeinput", _ => {
        textBeforeInput = textarea.value;
    })
    textarea.addEventListener("input", _ => {
        changeInsideCell(fileData.key, fileData.name, cellData.merge_id, textBeforeInput, textarea.value)
        updateTextAreaHeight(textarea);
    })

    cellContainer.append(typeSelection, textareaContainer, buttonContainer);


    if (cellData.outputs?.length) {
        const outputContainer = document.createElement("details");
        outputContainer.classList.add("outputContainer")
        outputContainer.setAttribute("open", "")
        const summary = document.createElement("summary");
        summary.textContent = "Hide output";
        outputContainer.append(summary);
        for (const { text, data, ...output } of cellData.outputs) {
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
        cellContainer.append(outputContainer)
    }



    // notebook.append(cellContainer);
    // updateTextAreaHeight(textarea);
    return cellContainer;
}

function updateTextAreaHeight(textarea) {
    textarea.style.height = "0px";
    textarea.style.height = textarea.scrollHeight + 2 + "px";
}

function createTextArea(cellId, fileData) {
    const textarea = document.createElement("textarea");

    textarea.setAttribute("contenteditable", true);
    textarea.setAttribute("spellcheck", false);

    textarea.addEventListener("focus", focus, {once: true});
    let interval = null;

    function focus() {
        currentCelNumber = cellId;
        selectionStart = -1;
        selectionEnd = -1;

        interval = setInterval(checkcaret, 100);
        textarea.addEventListener("blur", blur, {once: true});
    }

    function blur() {
        clearInterval(interval);
        textarea.addEventListener("focus", focus, {once: true});
    }

    function checkcaret() {
        if (currentCelNumber !== cellId) return;
        const caretHasMoved = (
            selectionDirection != textarea.selectionDirection ||
            selectionStart != textarea.selectionStart ||
            selectionEnd != textarea.selectionEnd
        );
        
        selectionStart = textarea.selectionStart;
        selectionEnd = textarea.selectionEnd;
        selectionDirection = textarea.selectionDirection;
        
        if (!caretHasMoved) return;

        socket.emit("caretUpdate", {
            selectionStart,
            selectionEnd,
            selectionDirection,
            cel: cellId,
            key: fileData.key,
            filename: fileData.name,
        });
    }

    return textarea
}

/**
 * Returns json copy of a file without outputs or other useless data so save space from server.
 */
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


/**
 * Returns json copy of a file without row id numbers.
 * Row id numbers are only used to sync the file with the server, end will break the file if keps
 */
async function writeJsonDataToUserFile(fileData) {
    if(!fileData.handler) {
        fileData.handler = await showSaveFilePicker();
        const fileHandler = await fileData.handler.getFile();
        fileData.lastModified = fileHandler.lastModified;
        allFileHandlers.push(fileData);
    }



    // Broken koska objecti muutos
    const clone = structuredClone(fileData.data);
    for(const cell of clone.cells) {
        cell.source = cell.source.split("\n").map((v, i, arr) => i === arr.length - 1 ? v : v + "\n");
        if (cell.source.length <= 1) cell.source = cell.join("");
        delete cell.id;
    }
    const stream = await fileData.handler.createWritable();
    await stream.write(JSON.stringify(clone, null, 2));
    const file = await fileData.handler.getFile();
    fileData.lastModified = file.lastModified;
    await stream.close();
}

/**
 * Test if file has changes.
 * If file has changes detect every changed row and send the changes to server which will update 
 * the local files variable.
 * This function also updates the outputs in each cell of the local files variable
 */
function parseFileChanges(fileData) {
    
}

// setInterval(() => {
//     if(document.activeElement?.tagName === "TEXTAREA") {
//         const text = document.activeElement.value;
//         // console.log(files[123]["/Linear_and_Logistic_Regression/Linear_and_logistic_regression.ipynb"])
//         if (!files[123]?.["/Linear_and_Logistic_Regression/Linear_and_logistic_regression.ipynb"].handler) {
//             return;
//         }
//         changeInsideCell(123, "/Linear_and_Logistic_Regression/Linear_and_logistic_regression.ipynb", 0, text, text + "a")
//     }
// }, 100)

function changeInsideCell(key, filename, cellId, beforeEditText, editedText) {
    if (beforeEditText === editedText) return;

    const cell = files[key][filename].data.cells.find(v => v.merge_id === cellId);
    const change = {key, cel: cellId, filename, id: cell.id};
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
    //     if (key === "id") return undefined;
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

function changeTextarea(rootChanges) {
    // console.log("Change pre element", rootChanges);

    const advancedClone = structuredClone(rootChanges);
    for(let i = 1; i < advancedClone.length; i++) {
        for(let j = 0; j < i; j++) {
            advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
        }
    }

    let newText = null;
    let cellNum = -1;
    for(const change of advancedClone) {
        if (currentFileName !== change.filename) return;
        if(newText === null) {
            const fileData = files[change.key][change.filename];
            cellNum = fileData.data.cells.findIndex(v => v.merge_id === change.cel);
            newText = fileData.data.cells[cellNum].source;
        }
        newText = newText.substring(0, change.start) + change.data + newText.substring(change.end);
    }

    if(cellNum === -1) return;
    const textarea = notebook.querySelectorAll("textarea")[cellNum];
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectionDirection = textarea.selectionDirection;
    textarea.value = newText;
    textarea.selectionStart = selectionStart;
    textarea.selectionEnd = selectionEnd;
    textarea.selectionDirection = selectionDirection;
    updateTextAreaHeight(textarea);
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
})();

Object.assign(globalThis.String.prototype, {
    str: function(change) {
        return this.substring(0, change.start) + change.data + this.substring(change.end);
    }
})