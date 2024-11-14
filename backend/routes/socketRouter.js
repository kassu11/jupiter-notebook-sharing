const {hostedFiles, roomUsers, users} = require("../controllers/fileRouter");
const {socketIO} = require("../app")

const socketConnection = (socket) => {
	console.log(`⚡: ${socket.id} user just connected!`);
    users[socket.id] = null;

    socket.on("disconnect", () => {
        console.log(`🔥: A user ${socket.id} disconnected`);
        const key = users[socket.id];
        roomUsers[key] = roomUsers[key]?.filter(user => user.id != socket.id) ?? [];
        delete users[socket.id];
        const socketKey = `userDisconnect${key}`;
        socket.broadcast.emit(socketKey, { key, userId: socket.id });

        if (roomUsers[key]?.length === 0) {
            delete hostedFiles[key];
        }
    });

	socket.on("lag", _ => {
		const date = new Date();
		const delay = date.setSeconds(date.getSeconds() + 15);

		while(new Date().getTime() < delay) {

		}
	});

	socket.on("caretUpdate", caret => {
		try {
            if (!(caret.key in hostedFiles)) throw new Error("Invalid key");
            const socketKey = `caretUpdate${caret.key}`;
            const user = roomUsers[caret.key].find(user => user.id == socket.id);
            if (!user) throw new Error("User not found");
            user.caret = caret;

            socket.broadcast.emit(socketKey, {...caret, userId: socket.id, color: user.color});
		} catch (e) {
			console.error(e)
		}
	});

	socket.on("cellChange", change => {
		try {
			const socketKey = `cellChange${change.key}`
			const fileData = hostedFiles[change.key][change.filename];
            const cellIndex = fileData.data.cells.findIndex(v => v.id === change.cel);
            if (cellIndex === -1) throw new Error("Invalid cell ID");

            if (change.type === "delete") {
                fileData.data.cells.splice(cellIndex, 1);
                socketIO.emit(socketKey, change);
            } else if(change.type === "add") {
                const newCell = {
                    cell_type: "code",
                    execution_count: null,
                    id: generateRandomId(),
                    metadata: {},
                    outputs: [],
                    source: "",
                    custom_modifications: 0,
                };
                fileData.data.cells.splice(cellIndex + 1, 0, newCell);
                socketIO.emit(socketKey, {...change, data : newCell});
            } else if(change.type === "moveUp") {
                if (cellIndex === 0) throw new Error("Can't move cell up");
                [fileData.data.cells[cellIndex - 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex - 1]]
                socketIO.emit(socketKey, change);
            } else if(change.type === "moveDown") {
                if (cellIndex === fileData.data.cells.length - 1) throw new Error("Can't move cell down");
                [fileData.data.cells[cellIndex + 1], fileData.data.cells[cellIndex]] = [fileData.data.cells[cellIndex], fileData.data.cells[cellIndex + 1]]
                socketIO.emit(socketKey, change);
            } else if(change.type === "changeType") {
                fileData.data.cells[cellIndex].cell_type = change.newType;
                socketIO.emit(socketKey, change);
            }
	
		} catch (e) {
			console.error(e)
		}
	});

    socket.on("changeFile", changePackage => {
        try {
            const socketKey = `fileUpdates${changePackage.key}`
            const fileData = hostedFiles[changePackage.key][changePackage.filename];
            const cell = fileData.data.cells.find(v => v.id === changePackage.cel);
            const changeFilo = fileData.changes;

            if (changePackage.custom_modifications > cell.custom_modifications) throw new Error("custom_modifications is too large");
            
            if (cell.custom_modifications !== changePackage.custom_modifications) {
                console.log("Wrong custom_modifications");
                for (const oldChangePackage of changeFilo.iterator()) {
                    if (oldChangePackage.custom_modifications < changePackage.custom_modifications) continue;
                    if (oldChangePackage.cel != changePackage.cel) continue;
                    if (oldChangePackage.custom_modifications > changePackage.custom_modifications) throw new Error("Invalid custom_modifications");
                    
                    for (const oldChange of oldChangePackage.changes) {
                        for(let i = 0; i < changePackage.changes.length; i++) {
                            changePackage.changes[i] = advanceChangeForward(oldChange, changePackage.changes[i]);
                        }
                    }
                    changePackage.custom_modifications++;

                    console.log("old: ", oldChangePackage);
                }

                if (changePackage.custom_modifications !== cell.custom_modifications) throw new Error("Too old custom_modifications");
            }

            const advancedClone = structuredClone(changePackage.changes);
            for(let i = 1; i < advancedClone.length; i++) {
                for(let j = 0; j < i; j++) {
                    advancedClone[i] = advanceChangeForward(advancedClone[j], advancedClone[i]);
                }
            }
            
            for(const change of advancedClone) {
                cell.source = cell.source.substring(0, change.start) + change.data + cell.source.substring(change.end);;
            }
            cell.custom_modifications++;
            changeFilo.push({...changePackage, changes: advancedClone});

            socketIO.emit(socketKey, { ...changePackage, userId: socket.id });
            // socket.broadcast.emit(socketKey, change);
        } catch (e) {
            console.error(e)
        }
	});

};

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

module.exports = { socketConnection };
