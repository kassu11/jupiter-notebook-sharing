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
let currentCaretStart = 0;
let currentCaretEnd = 0;
let currentCelNumber = -1;

const socket = socketIO("http://localhost:4000/", {
    auth: (token) => {
        token({ token: "test" });
    }
});

window.addEventListener("resize", () => {
    document.querySelectorAll("textarea").forEach(updateTextAreaHeight);
});
window.addEventListener("keydown", async (event) => {
    if (event.ctrlKey && event.code === "KeyS") {
        event.preventDefault();
        // console.log(currentFileName)
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
                    // console.log(localCells[i]?.merge_id, fileCells[j]?.merge_id)
                    if (localCells[i]?.merge_id === fileCells[j]?.merge_id) {
                        localCells[i].metadata = fileCells[j].metadata;
                        localCells[i].cell_type = fileCells[j].cell_type;
                        localCells[i].outputs = fileCells[j].outputs;
                        localCells[i].execution_count = fileCells[j].execution_count;

                        changeInsideCell(
                            fileData.key,
                            fileData.name,
                            localCells[i].merge_id,
                            localCells[i].source,
                            fileCells[j].source.join("")
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

    console.log(jsonDataCopyForServer(filesData));

    initLocalFileInfos(key, filesData);
    socketJoin(key);
});

join.addEventListener("click", async e => {
    const roomKey = prompt("Enter room key");
    // loadProjectFolder();

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
    socket.on(`fileUpdates${key}`, change => {
        
        const unappliedChanges = allUnappliedChanges[key + change.filename][change.cel].unappliedChanges;
        let needToUpdateCaret = change.cel === currentCelNumber && currentFileName === change.filename;
        if(unappliedChanges.length) {
            if (JSON.stringify(change) === JSON.stringify(unappliedChanges[0])) {
                unappliedChanges.shift();
                needToUpdateCaret = false;
            }
        } 

        console.log("Changes", change, unappliedChanges)
        changeTextarea([change, ...unappliedChanges]);
        if (needToUpdateCaret) updateCaret(change);
        for(let i = 0; i < unappliedChanges.length; i++) {
            unappliedChanges[i] = advanceChangeForward(change, unappliedChanges[i]);
            unappliedChanges[i].id++;
        }

        const fileData = files[change.key][change.filename];
        const cell = fileData.data.cells.find(v => v.merge_id === change.cel);
        const sourceText = cell.source;
        cell.source = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
        cell.id++;
    });

    function updateCaret(change) {
        console.log("Caret")
        if (change.end <= currentCaretStart) currentCaretStart += change.data.length - (change.end - change.start);
        if (change.end <= currentCaretEnd) currentCaretEnd += change.data.length - (change.end - change.start);
        
        document.querySelectorAll("textarea")[currentCelNumber].selectionStart = currentCaretStart;
        document.querySelectorAll("textarea")[currentCelNumber].selectionEnd = currentCaretEnd;
    }
}



function initLocalFileInfos(key, files) {
    for(const file of Object.values(files)) {
        allUnappliedChanges[key + file.name] = {};
        const cells = allUnappliedChanges[key + file.name];
        for(const cell of file.data.cells) {
            cells[cell.merge_id] = {unappliedChanges: []};
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
        cell.source = cell.source.join("");
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
        const textarea = createTextArea(cell.merge_id);
        textarea.value = cell.source;
        let textBeforeInput = "";

        textarea.addEventListener("beforeinput", _ => {
            textBeforeInput = textarea.value;
        })
        textarea.addEventListener("input", _ => {
            changeInsideCell(fileData.key, fileData.name, cell.merge_id, textBeforeInput, textarea.value)
            updateTextAreaHeight(textarea);
        })
        notebook.append(textarea);
        updateTextAreaHeight(textarea);
    }
}

function updateTextAreaHeight(textarea) {
    textarea.style.height = "0px";
    textarea.style.height = textarea.scrollHeight + 5 + "px";
}

function createTextArea(cellNum) {
    const textarea = document.createElement("textarea");

    textarea.setAttribute("contenteditable", true);
    textarea.setAttribute("spellcheck", false);

    textarea.addEventListener("focus", focus, {once: true});

    function focus() {
        currentCelNumber = cellNum;

        textarea.addEventListener("keydown", checkcaret);
        textarea.addEventListener("mousedown", checkcaret);
        textarea.addEventListener("touchstart", checkcaret);
        textarea.addEventListener("input", checkcaret);
        textarea.addEventListener("paste", checkcaret);
        textarea.addEventListener("cut", checkcaret);
        textarea.addEventListener("mousemove", checkcaret);
        textarea.addEventListener("select", checkcaret);
        textarea.addEventListener("selectstart", checkcaret);
        textarea.addEventListener("blur", blur, {once: true});
    }

    function blur() {
        textarea.addEventListener("keydown", checkcaret);
        textarea.addEventListener("mousedown", checkcaret);
        textarea.addEventListener("touchstart", checkcaret);
        textarea.addEventListener("input", checkcaret);
        textarea.addEventListener("paste", checkcaret);
        textarea.addEventListener("cut", checkcaret);
        textarea.addEventListener("mousemove", checkcaret);
        textarea.addEventListener("select", checkcaret);
        textarea.addEventListener("selectstart", checkcaret);
        textarea.addEventListener("focus", focus, {once: true});
    }

    function checkcaret() {
        currentCaretStart = textarea.selectionStart;
        currentCaretEnd = textarea.selectionEnd;
        // console.log(textarea.selectionStart, textarea.selectionEnd);
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
        console.log("If change: 1 done")
        change.start = 0;
        change.end = beforeEditText.length;
        change.data = editedText;
    } else if (firstUnchangedChar === -1) {
        console.log("If change: 2 and 3 done")
        change.start = 0;
        change.end = beforeEditText.length - 1 - lastUnchangedChar;
        change.data = editedText.substring(0, editedText.length - 1 - lastUnchangedChar);
    } else if (lastUnchangedChar === -1) {
        console.log("If change: 4 and 5 done")
        change.start = firstUnchangedChar + 1;
        change.end = beforeEditText.length;
        change.data = editedText.substring(firstUnchangedChar + 1);
    } else {
        console.log("If change: 6 and 7 done");
        change.start = firstUnchangedChar + 1;
        change.end = beforeEditText.length - lastUnchangedChar - 1;
        change.data = editedText.substring(firstUnchangedChar + 1, editedText.length - lastUnchangedChar - 1);
    }
    // console.log(firstUnchangedChar, lastUnchangedChar);
    // console.log({start: firstUnchangedChar, end: lastUnchangedChar})

    console.log(JSON.stringify(change, (key, val) => {
        if (key === "filename") return undefined;
        if (key === "cel") return undefined;
        if (key === "id") return undefined;
        if (key === "key") return undefined;
        return val;
    }));

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
    
    changeTextarea(unappliedChanges);
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
    }  else if (true) {
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
    } else if (true) {
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
    console.log("Change pre element", rootChanges);

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
    console.log("????")
    const textarea = notebook.querySelectorAll("textarea")[cellNum];
    textarea.value = newText;
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