import socketIO from "socket.io-client";
const loadButton = document.querySelector("#openProjectFolder");
const fileTree = document.querySelector("#fileTree");
const notebook = document.querySelector("#notebook");
const host = document.querySelector("#host");
const join = document.querySelector("#join");

loadButton.addEventListener("click", loadProjectFolder);
async function loadProjectFolder() {
    fileTree.textContent = "";
    const reponse = await showDirectoryPicker({ id: "jupiter", mode: "readwrite" });

    for await (const entry of reponse.values()) await recurseSubFiles(entry, fileTree);
}

/**
 * @param {FileSystemDirectoryHandle} entry
 */
async function recurseSubFiles(entry, parentUl) {
    if (entry.kind == "directory") await createDirectory(entry, parentUl)
    else if (entry.kind == "file") await createFile(entry, parentUl);
}

/**
 * @param {FileSystemDirectoryHandle} directory
 */
async function createDirectory(directory, parentUl) {
    if (directory.name == ".git") return;
    if (directory.name == "node_modules") return;
    
    const li = document.createElement("li");
    li.textContent = directory.name;
    const ul = document.createElement("ul");
    li.append(ul);
    parentUl.append(li);

    for await (const entry of directory.values()) {
        await recurseSubFiles(entry, ul);
    }

}

/**
 * @param {FileSystemFileHandle} file
 */
async function createFile(file, parentUl) {
    if (file.name.substring(file.name.length - 6) !== ".ipynb") return;
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

const socket = socketIO("http://localhost:4000/", {
    auth: (token) => {
        token({token: "test"});
    }
});


socket.on("post/10", e => {
    console.log("Socket message", e)
})