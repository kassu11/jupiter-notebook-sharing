(() => {
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const url = window.location != window.parent.location ? document.referrer : document.location.href;

	const exclude = window.location.href.includes("https://remotedesktop.google.com/");

	if (!exclude) window.addEventListener("keyup", (e) => {
		const videos = document.querySelectorAll("video");
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (document.activeElement.tagName == "INPUT") return;
		if (document.activeElement.tagName == "TEXTAREA") return;
		if (Array.from(videos).every(video => !video.hasAttribute("src"))) return;

		const kerroin = e.shiftKey ? -1 : 1;

		if (e.code == "KeyP" && (url.includes("aniwave") || url.includes("gogoanime"))) {
			chrome.storage.local.set({ nextEP: { kerroin, aika: new Date().getTime() } });
		}
		if (!videos.length) return;

		videos.forEach((video) => {
			if (e.code == "KeyU") video.currentTime += 85 * kerroin;
			else if (e.code == "KeyI") video.currentTime += 30 * kerroin;
			else if (e.code == "KeyO") video.currentTime += 60 * kerroin;
			else if (e.code == "Semicolon") video.currentTime += 5 * kerroin;
			else if (e.code == "Quote") video.currentTime += 3 * kerroin;
			else if (e.code == "BracketLeft") video.currentTime += 1.5 * kerroin;
			else if (e.code == "KeyS") {
				video.playbackRate = video.playbackRate + 0.25 * kerroin, 1;
			} else if (e.code == "KeyQ") {
				if (video.currentTime < 1) return;
				if (e.shiftKey) localStorage.setItem("currentFame", video.currentTime);
				else video.currentTime = parseFloat(localStorage.getItem("currentFame")) || 0;
			} else if (e.code == "KeyW") {
				chrome.storage.local.get("binge", (data) => {
					if (!data?.binge) {
						chrome.storage.local.set({ binge: { time: new Date().getTime() } })
						alert("Binge mode on");
					} else {
						chrome.storage.local.remove("binge");
						videos.forEach(video => video.playbackRate = 1);
					}
				});
			}

			if (window.location.href.indexOf("youtube") === -1) {
				if (e.code === "Comma") {
					video.currentTime -= 1 / 29.97;
				}
				if (e.code === "Period") {
					video.currentTime += 1 / 29.97;
				}
			}
		});
	});

	if (location?.href?.indexOf("aniwave") !== -1) {
		setInterval(() => {
			chrome.storage.local.get("nextEP", async (data) => {
				if (!data?.nextEP) return;
				const { nextEP } = data;
				const currentEpisodeNum = parseInt(location.href.split("/ep-")[1]);
				const currentTime = new Date().getTime();
				const nextEpButton = document.querySelector(".forward.next");
				const prevEpButton = document.querySelector(".forward.prev");

				if (currentTime - nextEP.aika > 5000) {
					chrome.storage.local.remove("nextEP");
					return;
				} else if (currentEpisodeNum >= 0) {
					for (let i = 0; i < 100; i++) {
						if (nextEP.kerroin === 1) nextEpButton?.click();
						else prevEpButton?.click();
						await sleep(100);

						const newEpisodeNum = parseInt(location.href.split("/ep-")[1]);
						if (newEpisodeNum !== currentEpisodeNum) {
							chrome.storage.local.remove("nextEP");
							return;
						}
					}
				}
			});
		}, 200);
	}

	if (location?.href?.indexOf("gogoanime") !== -1) {
		setInterval(() => {
			chrome.storage.local.get("nextEP", async (data) => {
				if (!data?.nextEP) return;
				const { nextEP } = data;
				const currentEpisodeNum = parseInt(location.href.slice(location.href.lastIndexOf("-") + 1));
				const currentTime = new Date().getTime();
				const nextEpButton = document.querySelector(".anime_video_body_episodes_r > a");
				const prevEpButton = document.querySelector(".anime_video_body_episodes_l > a");

				if (currentTime - nextEP.aika > 5000) {
					chrome.storage.local.remove("nextEP");
					return;
				} else if (currentEpisodeNum >= 0) {
					for (let i = 0; i < 100; i++) {
						let newUrl = location.href;
						if (nextEP.kerroin === 1 && nextEpButton) newUrl = nextEpButton.href;
						else if (prevEpButton) newUrl = prevEpButton.href;

						if (location.href !== newUrl) {
							chrome.storage.local.remove("nextEP");
							location.href = newUrl;
							return;
						}

						await sleep(100);
					}
				}
			});
		}, 200);
	}

	setInterval(() => {
		const videos = document.querySelectorAll("video");
		if (videos.length == 0) return;

		chrome.storage.local.get("binge", (data) => {
			if (!data?.binge) return;
			const { binge: { time } } = data;
			const currentTime = new Date();


			videos.forEach(video => {
				const goalTime = new Date(time);
				while (goalTime < currentTime) goalTime.setMinutes(goalTime.getMinutes() + 20);

				const videoTimeLeft = video.duration - video.currentTime;
				const videoEndTime = new Date();
				videoEndTime.setSeconds(videoEndTime.getSeconds() + videoTimeLeft);
				const timeLeftToWatch = (goalTime - currentTime) / 1000;
				const speed = videoTimeLeft / timeLeftToWatch;
				if (speed < 1) {
					video.playbackRate = 1;
					return;
				} else if (speed > 2.5) {
					goalTime.setMinutes(goalTime.getMinutes() + 20);
					const timeLeftToWatch = (goalTime - currentTime) / 1000;
					const speed = videoTimeLeft / timeLeftToWatch;
					video.playbackRate = +Math.max(1, speed).toFixed(4);
				} else {
					video.playbackRate = +speed.toFixed(4);
				}
			});
		});
	}, 1000);

	// window.addEventListener("mousedown", e => {
	//   const video = document.querySelector("video");
	//   if(!video) return;

	//   if(e.buttons === 4) {
	//     document.querySelector("video").currentTime += 85;
	//   }
	// })

});

if (location.href.includes("http://localhost:5500/") || location.href.includes("https://kassu11.github.io/jupiter-notebook-sharing/")) initJupiterShare();
else if (location.href.includes("http://localhost:8888/")) initJupiterlab();

function initJupiterShare() {
	addReloadSetting();
}

function addReloadSetting() {
	const autoSaveLable = document.querySelector(`.header label[for="autosave"]`);
	if (!autoSaveLable) return;

	const lable = document.createElement("lable");
	lable.setAttribute("for", "jupiterlabReload");

	const input = document.createElement("input");
	input.setAttribute("type", "checkbox");
	input.setAttribute("name", "jupiterlabReload");
	input.setAttribute("id", "jupiterlabReload");

	const button = document.createElement("button");
	button.id = "reloadJupiterlab";
	button.textContent = "Reload";
	button.addEventListener("click", sendReloadRequest);
	
	lable.append(input, " Jupiterlab reload");
	autoSaveLable.after(lable);
	autoSaveLable.before(button);
}

function sendReloadRequest() {
	chrome.storage.local.set({ reload: true });
}

function initJupiterlab() {
	const exitEditMode = document.createElement("button");
	exitEditMode.setAttribute("data-commandLinker-command", "notebook:enter-command-mode");
	const reload = document.createElement("button");
	reload.setAttribute("data-commandLinker-command", "docmanager:reload");

	setInterval(() => {
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
	}, 200);
}