
const baseURL = "https://jupiter-notebook-sharing.onrender.com/api/"
export const api = {
    hostFiles: async ({ key, fileData, id }) => {
        const response = await fetch(`${baseURL}files/host-files`, {
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
        const response = await fetch(`${baseURL}files/join-files`, {
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