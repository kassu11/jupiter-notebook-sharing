window.addEventListener("keydown", e => {
    const lowerKey = e.key.toLowerCase();
    
    let processedShortcut = true;
    if (lowerKey === "arrowdown" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.target?.closest(".notebook-cell").querySelector("#cell-down")?.click();
    } else if (lowerKey === "arrowup" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.target?.closest(".notebook-cell").querySelector("#cell-up")?.click();
    } else processedShortcut = false;

    if (processedShortcut) {
        e.preventDefault?.();
        e.stopPropagation?.();
        e.stopImmediatePropagation?.();
    }
}, {capture: true});