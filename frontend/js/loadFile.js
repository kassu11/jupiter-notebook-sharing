import socketIO from "socket.io-client";
import {api} from "./api";
const loadButton = document.querySelector("#openProjectFolder");
const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");

const files = {}

const socket = socketIO("http://localhost:4000/", {
    auth: (token) => {
        token({ token: "test" });
    }
});


host.addEventListener("click", async e => {
    const key = prompt("Set custom room key");
    const fileData = await loadProjectFolder();
    files[key] = fileData;

    await api.hostFiles({fileData: fileData.map(r => jsonDataCopyForServer(r.data)), key, id: socket.id});

    console.log(writeJsonDataToUserFile(fileData[0]));


    // socket.on("post/" + key, e => {
    //     console.log("Socket message", e)
    // })
});

join.addEventListener("click", async e => {
    const key = prompt("Enter room key");
    // loadProjectFolder();

    const t = await api.getLoadedFiles({key});

    // await api.hostLobby({key});

    console.log(t)


    // socket.on("post/" + key, e => {
    //     console.log("Socket message", e)
    // });

    // socket.emit("post", {"test": 5})
});
loadButton.addEventListener("click", loadProjectFolder);

async function loadProjectFolder() {
    fileTree.textContent = "";
    const reponse = await showDirectoryPicker({ id: "jupiter", mode: "readwrite" });
    const fileNames = [];

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
    fileNames.push({name: `${path}/${file.name}`, data: jsonData});
    const li = document.createElement("li");
    li.classList.add("file");
    li.textContent = file.name;
    li.addEventListener("click", () => clickFile(file));
    parentUl.append(li);
}

async function clickFile(file) {
    const fileHandler = await file.getFile();
    const fileData = await fileHandler.text();
    const jsonData = JSON.parse(fileData);
    notebook.textContent = "";
    for (const block of jsonData.cells) {
        const pre = document.createElement("pre");
        pre.setAttribute("contenteditable", true);
        const save = document.createElement("button");
        save.textContent = "Save";
        save.addEventListener("click", async () => {
            const stream = await file.createWritable();
            block.source = pre.innerText.split("\n").map(v => v + "\n");
            await stream.write(JSON.stringify(jsonData, null, 4));
            await stream.close();
        })
        pre.textContent = block.source.join("");
        notebook.append(pre, save);
        console.log(block);
    }
}

/**
 * Returns json copy of a file without outputs or other useless data so save space from server.
 */
function jsonDataCopyForServer(data) {
    const clone = structuredClone(data);
    clone.cells.forEach(row => {
        delete row["metadata"];
        delete row["execution_count"];
        delete row["outputs"];
    });

    return clone;
}


/**
 * Returns json copy of a file without row id numbers.
 * Row id numbers are only used to sync the file with the server, end will break the file if keps
 */
function writeJsonDataToUserFile(fileInfo) {
    const clone = structuredClone(fileInfo.data);
    clone.cells.forEach(row => {
        for(let i = (row.source?.length - 1) || 0; i > 0; i -= 2) {
            row.source.splice(i, 1);
        };
    });

    return clone;
}

/**
 * Test if file has changes.
 * If file has changes detect every changed row and send the changes to server which will update 
 * the local files variable.
 * This function also updates the outputs in each cell of the local files variable
 */
function parseFileChanges() {

}