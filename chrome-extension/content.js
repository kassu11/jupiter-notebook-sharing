if (isJupiterShareTab()) initJupiterShare();
else if (isJupyterlabTab) initJupyterlab();

function isJupiterShareTab() {
	const url = location.href;
	return (url.includes("http://localhost:5500/") || url.includes("https://kassu11.github.io/jupiter-notebook-sharing/"))
}

function isJupyterlabTab() {
	const titleIsJupyterlab = document.title.toLowerCase().includes("jupyterlab");
	const isLocalHost = location.href.includes("http://localhost:");
	return titleIsJupyterlab && isLocalHost;
}

function initJupiterShare() {
	addReloadSetting();
}

function addReloadSetting() {
	const autoSaveLable = document.querySelector(`.header label[for="autosave"]`);
	if (!autoSaveLable) return;

	const label = document.createElement("label");
	label.setAttribute("for", "jupiterlabReload");

	const input = document.createElement("input");
	input.setAttribute("type", "checkbox");
	input.setAttribute("name", "jupiterlabReload");
	input.setAttribute("id", "jupiterlabReload");

	const button = document.createElement("button");
	button.id = "reloadJupiterlab";
	button.textContent = "Reload";
	button.addEventListener("click", sendReloadRequest);
	
	label.append(input, " JupyterLab reload");
	autoSaveLable.after(label);
	autoSaveLable.before(button);
}

function sendReloadRequest() {
	chrome.storage.local.set({ reload: true });
}

function initJupyterlab() {
	const exitEditMode = document.createElement("button");
	exitEditMode.setAttribute("data-commandLinker-command", "notebook:enter-command-mode");
	const reload = document.createElement("button");
	reload.setAttribute("data-commandLinker-command", "docmanager:reload");
	
	let interval = setInterval(() => {
		try {
			chrome.storage.local.get("reload", async (data) => {
				if (!data?.reload) return;
				chrome.storage.local.remove("reload");
	
				if (!reload.parentElement) {
					const parent = document.querySelector(".lm-MenuBar-content");
					if (!parent) return;
					parent.append(reload, exitEditMode);
				}
				
				exitEditMode.click();
				reload.click();
			});
		} catch (err) {
			console.error(err);
			clearInterval(interval);
		}
	}, 200);
}