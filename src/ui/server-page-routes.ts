// @ts-nocheck
export function createServerPageHandlers(deps) {
    const {
        listSaveIds,
        readConfirmDeleteSaveId,
        sendHtml,
        sendNotFound,
        normalizeShellTab,
        saveRoute,
        renderLauncherPage,
        renderSaveOpeningPage,
        renderIncrementalSavePage,
        openSaveClientAssetPath,
        saveShellClientAssetPath,
    } = deps;

    return {
        async handleLauncherPageRequest(response, requestUrl, flash) {
            const saveIds = await listSaveIds();
            const confirmDeleteSaveId = readConfirmDeleteSaveId(requestUrl, saveIds);
            sendHtml(response, renderLauncherPage(saveIds, flash, confirmDeleteSaveId));
        },
        async handleOpenSavePageRequest(response, requestUrl, openSaveMatch) {
            const saveIds = await listSaveIds();
            const saveId = decodeURIComponent(openSaveMatch[1] ?? "");
            if (!saveId || !saveIds.includes(saveId)) {
                sendNotFound(response, saveIds, `Save ${saveId || "(missing)"} was not found.`);
                return;
            }
            const activeTab = normalizeShellTab(requestUrl.searchParams.get("tab"));
            const destinationUrl = `${saveRoute(saveId, { tab: activeTab })}${activeTab === "dashboard" ? "?opened=1" : "&opened=1"}`;
            sendHtml(response, renderSaveOpeningPage(saveId, activeTab, destinationUrl, openSaveClientAssetPath));
        },
        async handleSavePageRequest(response, requestUrl, pathname) {
            const saveIds = await listSaveIds();
            const saveId = decodeURIComponent(pathname.slice("/save/".length));
            if (!saveId || !saveIds.includes(saveId)) {
                sendNotFound(response, saveIds, `Save ${saveId || "(missing)"} was not found.`);
                return;
            }
            sendHtml(response, renderIncrementalSavePage(saveId, normalizeShellTab(requestUrl.searchParams.get("tab")), saveShellClientAssetPath));
        },
    };
}
