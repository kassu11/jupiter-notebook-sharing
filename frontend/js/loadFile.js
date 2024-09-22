import socketIO from "socket.io-client";
import {api} from "./api";
const loadButton = document.querySelector("#openProjectFolder");
const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");
const lag = document.querySelector("#lag");

const files = {};
const unappliedChanges = [];
let currentFileName = "";

const socket = socketIO("http://localhost:4000/", {
    auth: (token) => {
        token({ token: "test" });
    }
});

lag.addEventListener("click", async e => {
    socket.emit("lag", "data")
});

host.addEventListener("click", async e => {
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



    socket.on(`fileUpdates${key}`, e => {
        changeLocalFilesAndUpdatePre(e);
    })
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


    socket.on(`fileUpdates${roomKey}`, e => {
        changeLocalFilesAndUpdatePre(e);
    })
    // socket.on("post/" + key, e => {
    //     console.log("Socket message", e)
    // });

    // socket.emit("post", {"test": 5})
});
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
    for(const cell of jsonData.cells) {
        cell.source = cell.source.join("");
        cell.id = 0;
    }
    const fileName = `${path}/${file.name}`;
    fileNames[fileName] = {name: fileName, data: jsonData, handler: file};
    const li = document.createElement("li");
    li.classList.add("file", "real");
    li.textContent = file.name;
    li.addEventListener("click", () => displayFileData(fileNames[fileName]));
    parentUl.append(li);
}

function displayFileData(fileData) {
    notebook.textContent = "";
    currentFileName = fileData.name;
    for (let i = 0; i < fileData.data.cells.length; i++) {
        const block = fileData.data.cells[i];
        const pre = document.createElement("pre");
        pre.setAttribute("contenteditable", true);
        pre.textContent = block.source;
        let textBeforeInput = "";

        pre.addEventListener("paste", (event) => {
            event.preventDefault();
            const textBeforeEdit = pre.innerText;

            const paste = (event.clipboardData || window.clipboardData).getData("text");
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            selection.getRangeAt(0).insertNode(document.createTextNode(paste));
            selection.collapseToEnd();

            changeInsideCell(fileData.key, fileData.name, i, textBeforeEdit, pre.innerText)
        });

        pre.addEventListener("beforeinput", _ => {
            textBeforeInput = pre.innerText;
        })
        pre.addEventListener("input", _ => {
            changeInsideCell(fileData.key, fileData.name, i, textBeforeInput, pre.innerText)
        })
        notebook.append(pre);
        if (fileData.handler) {
            const save = document.createElement("button");
            save.textContent = "Save";
            save.addEventListener("click", async () => {
                // const stream = await fileData.handler.createWritable();
                // block.source = pre.innerText.split("\n").map(v => v + "\n");
                // await stream.write(JSON.stringify( fileData.data, null, 4));
                // await stream.close();
                await writeJsonDataToUserFile(fileData);
            })

            notebook.append(save);
        }
        console.log(block);
    }

}

/**
 * Returns json copy of a file without outputs or other useless data so save space from server.
 */
function jsonDataCopyForServer(filesData) {
    const clone = structuredClone(filesData);
    for (const fileData of Object.values(clone)) {
        delete fileData.handler;
        delete fileData.key;
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
    // Broken koska objecti muutos
    const clone = structuredClone(fileData.data);
    const stream = await fileData.handler.createWritable();
    await stream.write(JSON.stringify(clone, null, 4));
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

function changeInsideCell(key, filename, cellNum, beforeEditText, editedText) {
    // console.log(key, filename, cellNum, editedText);

    if (beforeEditText === editedText) return;

    const change = {key, cel: cellNum, filename, id: files[key][filename].data.cells[cellNum].id};

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

    const advancedChanges = unappliedChanges.map((change, i, arr) => {
        if (i === 0) return change;
        let clone = structuredClone(change);
        for(let j = 0; j < i; j++) {
            clone = advanceChangeForward(arr[j], clone);
        }

        return clone;
    });

    advancedChanges.push(change);

    const revertedChange = advancedChanges.reduce((acc, _, index, arr) => {
        if (index === arr.length - 1) return acc;
        return revertChangeBackward(arr.at(-index - 2), acc);
    }, change);

    unappliedChanges.push(revertedChange);
    
    test(beforeEditText, change);
    // changeLocalFilesAndUpdatePre(change);
    // socket.emit("changeFile", change);

    const fileData = files[change.key][change.filename];
    const sourceText = fileData.data.cells[change.cel].source;
    testChanges(sourceText, editedText, unappliedChanges);
    

    function test(t, c) {
        const value = t.substring(0, c.start) + c.data + t.substring(c.end);
        console.log("Testing print: ", value == editedText);
        console.log(value);
        console.log(editedText);
    }
}

function advanceChangeForward(oldChange, change) {
    const clone = structuredClone(change);
    const currentMaxX = Math.max(clone.end, clone.start + clone.data.length);
    const oldMaxX = Math.max(oldChange.end, oldChange.start + oldChange.data.length);
    const charMovement = oldChange.data.length - (oldChange.end - oldChange.start);

    if (currentMaxX <= oldChange.start) {
        console.log("Revert 1: Done")
        return clone;
    } else if (oldMaxX <= clone.start) {
        console.log("Advance 2: Done")
        clone.start -= oldMaxX - oldChange.start;
        clone.end -= oldMaxX - oldChange.start;
    } else if (true) {
        console.log("Advance 3: ")
    } else if (true) {
        console.log("Advance 4: ")
    } else if (true) {
        console.log("Advance 5: ")
    } else if (true) {
        console.log("Advance 6: ")
    } else if (true) {
        console.log("Advance 7: ")
    } else if (true) {
        console.log("Advance 8: ")
    } else if (true) {
        console.log("Advance 1: ")
    }

    return clone
}


function revertChangeBackward(oldChange, change) {
    const clone = structuredClone(change);
    const oldMaxX = Math.max(oldChange.end, oldChange.start + oldChange.data.length);
    const currentMaxX = Math.max(clone.end, clone.start + clone.data.length);
    const charMovement = oldChange.data.length - (oldChange.end - oldChange.start);

    console.log(charMovement);
    // const curX = Math.max(change.end, change.start + change.data.length);
    // const curDiff = change.end - change.start + change.data.length;
    // if (oldX <= change.start) {
    //     change.start -= oldChange.end - oldChange.start - oldChange.data.length
    //     change.end -= oldChange.end - oldChange.start - oldChange.data.length
    // } else if(oldChange.start) {

    // }
    // change.id++;
    if (currentMaxX <= oldChange.start) {
        console.log("Revert 1: Done")
        return clone;
    }
    else if (oldMaxX <= clone.start) {
        console.log("Revert 2: done")
        clone.start += oldMaxX - oldChange.start;
        clone.end += oldMaxX - oldChange.start;
    } else if (true) {
        console.log("Revert 3: ")
    } else if (true) {
        console.log("Revert 4: ")
    } else if (true) {
        console.log("Revert 5: ")
    } else if (true) {
        console.log("Revert 6: ")
    } else if (true) {
        console.log("Revert 7: ")
    } else if (true) {
        console.log("Revert 8: ")
    } else if (true) {
        console.log("Revert 1: ")
    }

    return clone
}

function testChanges(sourceText, endText, changes) {
    let newText = sourceText;
    const advancedChanges = unappliedChanges.map((change, i, arr) => {
        if (i === 0) return change;
        let clone = structuredClone(change);
        for(let j = 0; j < i; j++) {
            clone = advanceChangeForward(arr[j], clone);
        }
        
        return clone;
    });
    console.log("Testing", changes, advancedChanges);
    for(const change of advancedChanges) {
        newText = newText.substring(0, change.start) + change.data + newText.substring(change.end);
    }

    if (endText === newText) console.log("%cChange Test passed", "background: green; color: white");
    else {
        console.log("%cChange Test failed", "background: red; color: white");
        console.log(endText);
        console.log(newText);
    }
}

function changeLocalFilesAndUpdatePre(change) {
    console.log("Change pre element", change)

    const fileData = files[change.key][change.filename];
    const sourceText = fileData.data.cells[change.cel].source;
    const newText = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
    // fileData.data.cells[change.cel].source = newText;
    // fileData.data.cells[change.cel].id++;
    // for(const change of changes.changes) {
    //     const row = block[change.row * 2]
    //     if (change.erase) {
    //         if (change.char == 0) {
    //             block[change.row * 2] = row.substring(change.char + change.erase);
    //         } else {
    //             block[change.row * 2] = row.substring(0, change.char) + row.substring(change.char + change.erase);
    //         }
    //         block[change.row * 2 + 1]++;
    //     }
    // }

    if (currentFileName !== change.filename) return;
    notebook.querySelectorAll("pre")[change.cel].textContent = newText;
}