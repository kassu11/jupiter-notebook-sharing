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
		const delay = date.setSeconds(date.getSeconds() + 5);

		while(new Date().getTime() < delay) {

		}
	});

	socket.on("changeFile", change => {
		console.log("Change start")
		try {
			console.log(change);
			const socketKey = `fileUpdates${change.key}`
			const fileData = hostedFiles[change.key][change.filename];
			const changeFilo = fileData.changes;
	
			// console.log(hostedFiles[changes.key][changes.filename].changes.iterator());
			
			// const wrongIds = change.changes.filter(change => {
			// 	// const id = fileData.data.cells[changes.cel].source[change.row*2 + 1];
			// 	// return change.id !== id;
			// });

			// console.log("Wrongid: ", wrongIds)

			// Modify changes if possible
			// wrongID: for(const wrongIdChange of wrongIds) {
			// 	for(const change of changeFilo.iterator()) {
			// 		if(change.cel !== change.cel) continue;
			// 		for(const oldChange of change.changes) {
			// 			if (oldChange.row !== wrongIdChange.row) continue;
			// 			if (oldChange.id >= wrongIdChange.id) {
			// 				wrongIdChange.id++;
			// 				if (oldChange.erase) {
			// 					if (oldChange.char <= wrongIdChange.char && oldChange.char + oldChange.erase >= wrongIdChange.char + wrongIdChange.erase) {
			// 						// ooooo  ooooo  ooooo  oooo
			// 						// WW---  WWWWW  ---WW  -WW-
			// 						wrongIdChange.char = 0;
			// 						wrongIdChange.erase = 0;
			// 						wrongIdChange.id = fileData.data.cells[change.cel].source[change.changes[0].row*2 + 1]
			// 						continue wrongID;
			// 					} else if (oldChange.char + oldChange.erase < wrongIdChange.char) {
			// 						// oooo----WWWW
			// 						wrongIdChange.char -= oldChange.erase;
			// 					} else if(oldChange.char >= wrongIdChange.char && wrongIdChange.char + wrongIdChange.erase >= oldChange.char + oldChange.erase) {
			// 						// oo---  ---oo  --oo--
			// 						// WWWWW  WWWWW  WWWWWW
			// 						wrongIdChange.erase -= oldChange.erase;
			// 					} else if(wrongIdChange.char < oldChange.char && wrongIdChange.char + wrongIdChange.erase < oldChange.char + oldChange.erase) {
			// 						// -oooo
			// 						// WWW--
			// 						wrongIdChange.erase = oldChange.char - wrongIdChange.char;
			// 					} else if(oldChange.char < wrongIdChange.char && oldChange.char + oldChange.erase < wrongIdChange.char + wrongIdChange.erase) {
			// 						// oooo-
			// 						// --WWW
			// 						wrongIdChange.char = oldChange.char + oldChange.erase;
			// 					}
			// 				}
			// 			}
			// 		}
					
	
			// 		console.log("--->", change);
			// 	}
			// }
			
			// Validate changes
			// for(const wrongChange of wrongIds) {
			// 	const id = fileData.data.cells[change.cel].source[wrongChange.row*2 + 1];
			// 	if (id !== wrongChange.id) throw new Error("Id in valid")
			// }

			// const block = fileData.data.cells[changes.cel].source;
			// for (const change of changes.changes) {
			// 	const row = block[change.row * 2]
			// 	if (change.erase) {
			// 		if (change.char == 0) {
			// 			block[change.row * 2] = row.substring(change.char + change.erase);
			// 		} else {
			// 			block[change.row * 2] = row.substring(0, change.char) + row.substring(change.char + change.erase);
			// 		}
			// 		block[change.row * 2 + 1]++;
			// 	}
			// }

			const sourceText = fileData.data.cells[change.cel].source;
			const newText = sourceText.substring(0, change.start) + change.data + sourceText.substring(change.end);
			fileData.data.cells[change.cel].source = newText;


			changeFilo.push(change);	
			// changeFilo.push(changes.changes);
	
			socketIO.emit(socketKey, change);
			// socket.broadcast.emit(socketKey, changes);
		} catch (e) {
			console.error(e)
		}
		console.log("Change end")
	});

	// socket.on("host", data => {
	// 	const valid = ("key" in data && "files" in data && data.key.length > 1);
	// 	if (!valid) return;
	// })
};

module.exports = { socketConnection };
