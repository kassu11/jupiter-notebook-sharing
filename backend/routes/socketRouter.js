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
		const delay = date.setSeconds(date.getSeconds() + 15);

		while(new Date().getTime() < delay) {

		}
	});

	socket.on("changeFile", change => {
		// console.log("Change start")
		try {
			// console.log(change);
			const socketKey = `fileUpdates${change.key}`
			const fileData = hostedFiles[change.key][change.filename];
			const changeFilo = fileData.changes;
	
			// console.log(hostedFiles[changes.key][changes.filename].changes.iterator());
			
			// const wrongIds = change.changes.filter(change => {
			// 	const id = fileData.data.cells[changes.cel].source[change.row*2 + 1];
			// 	return change.id !== id;
			// });

			if(fileData.data.cells[change.cel].id !== change.id) {
				console.log("Wrong id");
				for(const oldChange of changeFilo.iterator()) {
					if (oldChange.id < change.id) continue;
					if (oldChange.id > change.id) throw new Error("Invalid id");

					change = advanceChangeForward(oldChange, change);
					change.id++;

					console.log("old: ", oldChange);
				}

				if (change.id !== fileData.data.cells[change.cel].id) throw new Error("Too old id");
			}

					

			const sourceText = fileData.data.cells[change.cel].source;
			const newText = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
			fileData.data.cells[change.cel].source = newText;
    		fileData.data.cells[change.cel].id++;


			changeFilo.push(change);
			// changeFilo.push(changes.changes);
	
			socketIO.emit(socketKey, change);
			// socket.broadcast.emit(socketKey, change);
		} catch (e) {
			console.error(e)
		}
		// console.log("Change end")
	});

	// socket.on("host", data => {
	// 	const valid = ("key" in data && "files" in data && data.key.length > 1);
	// 	if (!valid) return;
	// })
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
