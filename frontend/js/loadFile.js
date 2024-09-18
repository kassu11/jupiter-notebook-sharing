import socketIO from "socket.io-client";
import {api} from "./api";
const loadButton = document.querySelector("#openProjectFolder");
const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");
const lag = document.querySelector("#lag");

const files = {}

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
    jsonData.cells.forEach(row => {
        for(let i = 1; i <= row.source?.length; i += 2) {
            row.source.splice(i, 0, 0);
        }
    });
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
    for (let i = 0; i < fileData.data.cells.length; i++) {
        const block = fileData.data.cells[i];
        const pre = document.createElement("pre");
        pre.setAttribute("contenteditable", true);
        pre.textContent = block.source.map((v, i) => i % 2 == 0 ? v : "").join("");
        pre.addEventListener("input", e => {
            sendPreElementCellChanges(fileData.key, fileData.name, i, pre.innerText)
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
    clone.cells.forEach(row => {
        for(let i = (row.source?.length - 1) || 0; i > 0; i -= 2) {
            row.source.splice(i, 1);
        };
    });

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

async function sendPreElementCellChanges(key, filename, cellNum, preCellText) {
    console.log(key, filename, cellNum, preCellText);
    const fileBlock = files[key][filename].data.cells[cellNum].source;
    const preCellBlock = preCellText.split("\n").map((v, i, a) => i == a.length - 1 ? v : v + "\n");
    if (preCellBlock.at(-1) === "") preCellBlock.length -= 1;
    const height = Math.max(fileBlock.length / 2, preCellBlock.length);
    const changes = []
    console.log(fileBlock, preCellBlock);
    for(let y = 0; y < height; y++) {
        const fileRow = fileBlock[y*2];
        const preRow = preCellBlock[y];
        console.log("Rows: \n", fileRow, preRow)
        if (fileRow === preRow) continue;
        else {
            const maxWidth = Math.max(fileRow.length, preRow.length);
            const minWidth = Math.min(fileRow.length, preRow.length);

            console.log("???", fileRow, preRow, preRow.length < fileRow.length)

            let startDiffPos = 0;
            let endDiffPos = maxWidth - 1;
            for(let x = 0; x < minWidth; x++) {
                if (fileRow[x] !== preRow[x]) break;
                startDiffPos = x + 1;
            }

            for(let x = 1; x < minWidth; x++) {
                if (fileRow.at(-x) !== preRow.at(-x)) break;
                if (startDiffPos + x >= minWidth - 1) break;
                endDiffPos = fileRow.length - x - 1;
            }

            
            if (preRow.length < fileRow.length) {
                console.log(endDiffPos - startDiffPos, maxWidth - minWidth)
                changes.push({ 
                    row: y,
                    char: startDiffPos,
                    erase: maxWidth - minWidth,
                    id: fileBlock[y * 2 + 1],
                });
            }
        }
    }

    
    console.log(changes);
    if (changes.length > 0) {
        changeLocalFilesAndUpdatePre({key, cel: cellNum, filename, changes});
        socket.emit("changeFile", {key, cel: cellNum, filename, changes})
    }
}


function changeLocalFilesAndUpdatePre(changes) {
    console.log("Change pre element", changes)

    const fileData = files[changes.key][changes.filename];
    const block = fileData.data.cells[changes.cel].source;
    for(const change of changes.changes) {
        const row = block[change.row * 2]
        if (change.erase) {
            if (change.char == 0) {
                block[change.row * 2] = row.substring(change.char + change.erase);
            } else {
                block[change.row * 2] = row.substring(0, change.char) + row.substring(change.char + change.erase);
            }
            block[change.row * 2 + 1]++;
        }
    }

    notebook.querySelectorAll("pre")[changes.cel].textContent = block.map((v, i) => i % 2 == 0 ? v : "").join("");
}