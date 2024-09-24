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
    const oldDelta = oldChange.end - oldChange.start;
    const curDelta = clone.end - clone.start;
    const oldMovement = oldChange.data.length - oldDelta;
    const curMovement = clone.data.length - curDelta;
    const oldMaxX = Math.max(oldChange.end, oldChange.start + oldChange.data.length);
    const curMaxX = Math.max(clone.end, clone.start + clone.data.length);

    if (oldMovement === 0 && curMovement === 0) {
        console.log("Revert 0: ")
        return clone;
    } else if (oldChange.end + oldMovement <= clone.start) {
        console.log("Revert 5: ")
        clone.start += oldMovement;
        clone.end += oldMovement;
    } else if (clone.start < oldChange.start && clone.end < oldChange.end && clone.end > oldChange.start) {
        console.log("Advance 2: ")
        clone.end += oldMovement;
    } else if (clone.start <= oldChange.start && clone.end - oldMovement > oldChange.end) {
        console.log("Advance 3: ")
        clone.end += oldMovement;
    } else if (clone.start > oldChange.start && clone.end > oldChange.end) {
        console.log("Advance 4: ")
        clone.end += oldMovement;
    } else if (oldChange.end <= oldChange.start) {
        console.log("Advance 10: ")
        clone.start -= oldMovement;
        clone.start -= oldMovement;
    } else if (oldMovement > 0 && clone.start < oldChange.start && oldChange.end + oldMovement > clone.end) {
        console.log("Advance 7: ")
        clone.end += oldMovement;
    }  else if (clone.start >= oldChange.start && curMaxX <= oldMaxX) {
        console.error("Advance 8: ")
        // clone.end += oldMovement;
    } else if (true) {
        console.error("Advance 9: ")
    } else if (true) {
        console.error("Advance 10: ")
    } else if (clone.end <= oldChange.start) {
        console.log("Advance 6: ")
        return clone;
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

    console.log(oldChange, change);

    if (oldMovement === 0 && curMovement === 0) {
        console.log("Revert 0: Done")
        return clone;
    }
    else if (oldChange.end + oldMovement <= clone.start) {
        console.log("Revert 5")
        clone.start -= oldMovement;
        clone.end -= oldMovement;
    } else if (clone.start < oldChange.start && clone.end < oldChange.end && clone.end > oldChange.start) {
        console.log("Revert 2: ")
        clone.end -= oldMovement;
    } else if (clone.start <= oldChange.start && clone.end - oldMovement > oldChange.end) {
        console.log("Revert 3: ")
        clone.end -= oldMovement;
    } else if (clone.start > oldChange.start && clone.end > oldChange.end) {
        console.log("Revert 4: ")
        clone.end -= oldMovement;
    } else if (oldChange.end <= oldChange.start) {
        console.log("Revert 10: ")
        clone.start -= oldMovement;
        clone.start -= oldMovement;
    } else if (oldMovement > 0 && clone.start < oldChange.start && oldChange.end + oldMovement > clone.end) {
        console.log("Revert 7: ")
        clone.end -= oldMovement;
    }  else if (clone.start >= oldChange.start && curMaxX <= oldMaxX) {
        console.error("Revert 8: ")
        // clone.end -= oldMovement;
    } else if (true) {
        console.error("Revert 9: ")
    } else if (true) {
        console.error("Revert 10: ")
    } else if (clone.end <= oldChange.start) {
        console.log("Revert 6: ")
        return clone;
    }

    return clone
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

    // Case 2
    test(
        "X_train, 321, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":17,"end":24,"data":"111"},
            {"start":12,"end":19,"data":"22"},
            {"start":9,"end":13,"data":"3"},
        ],
        [
            {"start":17,"end":24,"data":"111"},
            {"start":12,"end":23,"data":"22"},
            {"start":9,"end":22,"data":"3"},
        ]
    );

    // Case 3
    test(
        "X_train, X_test, y_train, y_test = tra3333333y, test_size=0.2, random_state=42)",
        [
            {"start":41,"end":45,"data":"1"},
            {"start":39,"end":44,"data":"2222"},
            {"start":38,"end":51,"data":"3333333"},
        ],
        [
            {"start":41,"end":45,"data":"1"},
            {"start":39,"end":47,"data":"2222"},
            {"start":38,"end":55,"data":"3333333"},
        ]
    );

    // Case 4
    test(
        "X_train, X_test, 1223_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":17,"end":24,"data":"111"},
            {"start":18,"end":30,"data":"2222"},
            {"start":20,"end":33,"data":"3"},
        ],
        [
            {"start":17,"end":24,"data":"111"},
            {"start":18,"end":34,"data":"2222"},
            {"start":24,"end":45,"data":"3"},
        ]
    );

    // Case 5
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

    // case 6
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
            {"start":35,"end":35,"data":"2"},
            {"start":35,"end":35,"data":"3"},
        ],
        [
            {"start":35,"end":35,"data":"1"},
            {"start":35,"end":35,"data":"2"},
            {"start":35,"end":35,"data":"3"},
        ]
    );

    // Case 7
    test(
        "X_train7777744444411_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)",
        [
            {"start":10,"end":10,"data":"11111"},
            {"start":9,"end":13,"data":"4444444"},
            {"start":7,"end":10,"data":"77777"},
        ],
        [
            {"start":10,"end":10,"data":"11111"},
            {"start":9,"end":8,"data":"4444444"},
            {"start":7,"end":2,"data":"77777"},
        ]
    );

    // Case 8
    test(
        "X_train, X_test, y_train, y_test = 111111123333221111111(X, y, test_size=0.2, random_state=42)",
        [
            {"start":35,"end":51,"data":"111111111111111111"},
            {"start":42,"end":46,"data":"222222"},
            {"start":43,"end":46,"data":"3333"},
        ],
        [
            {"start":35,"end":51,"data":"111111111111111111"},
            {"start":42,"end":44,"data":"222222"},
            {"start":43,"end":42,"data":"3333"},
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