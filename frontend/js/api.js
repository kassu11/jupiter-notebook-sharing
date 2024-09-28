
const baseURL = "https://jupiter-notebook-sharing.onrender.com/api/"
export const api = {
    hostLobby: async({key}) => {
        const response = await fetch(baseURL + `lobby/host/${key}`, {
            method: "POST",
            body: "",
        });

        return await response.json();
    },
    hostFiles: async({key, fileData, id}) => {
        console.log(key, fileData, id);
        const response = await fetch(baseURL + `files/host-all`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                key, fileData, id
            }),
        });

        return await response.json();
    },
    getLoadedFiles: async({key}) => {
        const response = await fetch(baseURL + `files/loaded/${key}`);

        return await response.json();
    }
}