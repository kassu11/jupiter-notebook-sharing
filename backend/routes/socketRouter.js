const {hostedFiles, hostingUsers} = require("../controllers/fileRouter");
const {socketIO} = require("../app")

const socketConnection = (socket) => {
	console.log(`⚡: ${socket.id} user just connected!`);

	socket.on("disconnect", () => {
		console.log(`🔥: A user ${socket.id} disconnected`);
		if (hostingUsers[socket.id]) {
			delete hostedFiles[hostingUsers[socket.id]];
		}
		delete hostingUsers[socket.id];
	});

	socket.on("lag", _ => {
		const date = new Date();
		const delay = date.setSeconds(date.getSeconds() + 4);

		while(new Date().getTime() < delay) {

		}
	});

	socket.on("caretUpdate", caret => {
		try {
            if (!(caret.key in hostedFiles)) throw new Error("Invalid key");
            const socketKey = `caretUpdate${caret.key}`;
            socket.broadcast.emit(socketKey, {...caret, userId: socket.id});
		} catch (e) {
			console.error(e)
		}
	});

	socket.on("cellChange", change => {
		try {
			const socketKey = `cellChange${change.key}`
			const fileData = hostedFiles[change.key][change.filename];
            const cellIndex = fileData.data.cells.findIndex(v => v.merge_id === change.cel);
            if (cellIndex === -1) throw new Error("Invalid cell ID");

            if (change.type === "delete") {
                fileData.data.cells.splice(cellIndex, 1);
                socketIO.emit(socketKey, change);
            } else if(change.type === "add") {
                const newCellId = fileData.data.cells.reduce((acc, cell) => Math.max( cell.merge_id, acc ), 1) + 1;
                const newCell = {
                    source: "",
                    cell_type: "code",
                    merge_id: newCellId,
                    id: 0,
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

	socket.on("changeFile", change => {
		try {
			const socketKey = `fileUpdates${change.key}`
			const fileData = hostedFiles[change.key][change.filename];
            const cell = fileData.data.cells.find(v => v.merge_id === change.cel);
			const changeFilo = fileData.changes;
	
			if(cell.id !== change.id) {
				console.log("Wrong id");
				for(const oldChange of changeFilo.iterator()) {
					if (oldChange.id < change.id) continue;
					if (oldChange.cel != change.cel) continue;
					if (oldChange.id > change.id) throw new Error("Invalid id");

					change = advanceChangeForward(oldChange, change);
					change.id++;

					console.log("old: ", oldChange);
				}

				if (change.id !== cell.id) throw new Error("Too old id");
			}

			const sourceText = cell.source;
			const newText = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
			cell.source = newText;
            cell.id++;

			changeFilo.push(change);
	
			socketIO.emit(socketKey, change);
			// socket.broadcast.emit(socketKey, change);
		} catch (e) {
			console.error(e)
		}
	});

};


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
