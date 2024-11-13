
const baseURL = "https://jupiter-notebook-sharing.onrender.com/api/"
export const api = {
    hostLobby: async ({ key }) => {
        const response = await fetch(baseURL + `lobby/host/${key}`, {
            method: "POST",
            body: "",
        });

        const json = await response.json();

        return { ...json, status: response.status };
    },
    hostFiles: async ({ key, fileData, id }) => {
        const response = await fetch(baseURL + `files/host-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                key, fileData, id
            }),
        });

        console.log(response);

        const json = await response.json();

        return { ...json, status: response.status };
    },
    getLoadedFiles: async ({ key, id }) => {
        const response = await fetch(baseURL + `files/get-file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                key, id
            }),
        });

        const json = await response.json();

        return { ...json, status: response.status };
    },
    getWelcomePage: async () => {
        const response = await fetch("https://jupiter-notebook-sharing.onrender.com/");
        const json = await response.json();

        return { ...json, status: response.status };
    }
}