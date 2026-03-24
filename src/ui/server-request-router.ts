// @ts-nocheck

let port;
let readFile;
let readForm;
let readFlashState;
let sendHtml;
let sendJson;
let withUiTiming;
let listSaveIds;
let sendNotFound;
let normalizeShellTab;
let pageHandlers;
let handleBootstrapApi;
let handleTabApi;
let handleClockApi;
let handleClockTickApi;
let handleClockAdvanceToCalendarAnchorApi;
let handleContractsViewApi;
let handleAcceptContractApi;
let handleCancelContractApi;
let handlePlannerAddApi;
let handlePlannerRemoveApi;
let handlePlannerReorderApi;
let handlePlannerClearApi;
let handlePlannerAcceptApi;
let handleCreateCompanyApi;
let handleAcquireAircraftApi;
let handleAcquireAircraftOfferApi;
let handleAddStaffingApi;
let handleScheduleMaintenanceApi;
let handleHirePilotCandidateApi;
let handleStartPilotTrainingApi;
let handleStartPilotTransferApi;
let handleConvertPilotToDirectHireApi;
let handleDismissPilotApi;
let handleAutoPlanContractApi;
let handleCommitScheduleApi;
let handleDiscardScheduleDraftApi;
let handleAdvanceTimeApi;
let handleBindRoutePlanApi;
let actionHandlers;
let saveShellClientAssetUrl;
let aircraftTabClientAssetUrl;
let dispatchTabClientAssetUrl;
let staffingTabClientAssetUrl;
let contractsTabClientAssetUrl;
let openSaveClientAssetUrl;
let pilotCertificationsModuleAssetUrl;
let dispatchPilotAssignmentModuleAssetUrl;
let maintenanceRecoveryModuleAssetUrl;
let uiBrowserModuleAssetUrls;
let resolveAircraftImageAsset;
let aircraftReference;
let ensureStaffPortraitAsset;
let isValidStaffPortraitAssetId;
let readStaffPortraitAsset;
let resolveStaffPortraitAssetId;
let escapeHtml;

export function createServerRequestRouter(deps) {
    ({
        port,
        readFile,
        readForm,
        readFlashState,
        sendHtml,
        sendJson,
        withUiTiming,
        listSaveIds,
        sendNotFound,
        normalizeShellTab,
        pageHandlers,
        handleBootstrapApi,
        handleTabApi,
        handleClockApi,
        handleClockTickApi,
        handleClockAdvanceToCalendarAnchorApi,
        handleContractsViewApi,
        handleAcceptContractApi,
        handleCancelContractApi,
        handlePlannerAddApi,
        handlePlannerRemoveApi,
        handlePlannerReorderApi,
        handlePlannerClearApi,
        handlePlannerAcceptApi,
        handleCreateCompanyApi,
        handleAcquireAircraftApi,
        handleAcquireAircraftOfferApi,
        handleAddStaffingApi,
        handleScheduleMaintenanceApi,
        handleHirePilotCandidateApi,
        handleStartPilotTrainingApi,
        handleStartPilotTransferApi,
        handleConvertPilotToDirectHireApi,
        handleDismissPilotApi,
        handleAutoPlanContractApi,
        handleCommitScheduleApi,
        handleDiscardScheduleDraftApi,
        handleAdvanceTimeApi,
        handleBindRoutePlanApi,
        actionHandlers,
        saveShellClientAssetUrl,
        aircraftTabClientAssetUrl,
        dispatchTabClientAssetUrl,
        staffingTabClientAssetUrl,
        contractsTabClientAssetUrl,
        openSaveClientAssetUrl,
        pilotCertificationsModuleAssetUrl,
        dispatchPilotAssignmentModuleAssetUrl,
        maintenanceRecoveryModuleAssetUrl,
        uiBrowserModuleAssetUrls,
        resolveAircraftImageAsset,
        aircraftReference,
        ensureStaffPortraitAsset,
        isValidStaffPortraitAssetId,
        readStaffPortraitAsset,
        resolveStaffPortraitAssetId,
        escapeHtml,
    } = deps);

    return { handleRequest };
}

async function handleRequest(request, response) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);
    const pathname = requestUrl.pathname;
    const flash = readFlashState(requestUrl);
    const contractsViewMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/view$/);
    const contractsAcceptMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/accept$/);
    const contractsCancelMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/cancel$/);
    const contractsPlannerMatch = pathname.match(/^\/api\/save\/([^/]+)\/contracts\/planner\/([^/]+)$/);
    const bootstrapMatch = pathname.match(/^\/api\/save\/([^/]+)\/bootstrap$/);
    const tabMatch = pathname.match(/^\/api\/save\/([^/]+)\/tab\/([^/]+)$/);
    const clockMatch = pathname.match(/^\/api\/save\/([^/]+)\/clock(?:\/([^/]+))?$/);
    const actionApiMatch = pathname.match(/^\/api\/save\/([^/]+)\/actions\/([^/]+)$/);
    const openSaveMatch = pathname.match(/^\/open-save\/([^/]+)$/);
    const aircraftModelImageMatch = pathname.match(/^\/assets\/aircraft-images\/model\/([^/]+)$/);
    const aircraftImageMatch = pathname.match(/^\/assets\/aircraft-images\/([^/]+)$/);
    const staffPortraitAssetMatch = pathname.match(/^\/assets\/staff-portraits\/([a-z0-9-]+)\.svg$/i);
    if (request.method === "GET" && pathname === "/assets/save-shell-client.js") {
        const assetSource = await readFile(saveShellClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/aircraft-tab-client.js") {
        const assetSource = await readFile(aircraftTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/dispatch-tab-client.js") {
        const assetSource = await readFile(dispatchTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/staffing-tab-client.js") {
        const assetSource = await readFile(staffingTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/contracts-tab-client.js") {
        const assetSource = await readFile(contractsTabClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/assets/open-save-client.js") {
        const assetSource = await readFile(openSaveClientAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/domain/staffing/pilot-certifications.js") {
        const assetSource = await readFile(pilotCertificationsModuleAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/domain/dispatch/named-pilot-assignment.js") {
        const assetSource = await readFile(dispatchPilotAssignmentModuleAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && pathname === "/domain/maintenance/maintenance-recovery.js") {
        const assetSource = await readFile(maintenanceRecoveryModuleAssetUrl, "utf8");
        response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    if (request.method === "GET" && aircraftModelImageMatch) {
        const modelId = decodeURIComponent(aircraftModelImageMatch[1] ?? "");
        const resolved = await resolveAircraftImageAsset(modelId, aircraftReference.findModel(modelId));
        response.writeHead(200, {
            "content-type": resolved.contentType,
            "cache-control": resolved.cacheControl,
        });
        response.end(await readFile(resolved.filePath));
        return;
    }
    if (request.method === "GET" && aircraftImageMatch) {
        const resolved = await resolveAircraftImageAsset(aircraftImageMatch[1] ?? "");
        response.writeHead(200, {
            "content-type": resolved.contentType,
            "cache-control": resolved.cacheControl,
        });
        response.end(await readFile(resolved.filePath));
        return;
    }
    if (request.method === "GET" && staffPortraitAssetMatch) {
        const portraitId = (staffPortraitAssetMatch[1] ?? "").toLowerCase();
        if (!isValidStaffPortraitAssetId(portraitId)) {
            sendHtml(response, `<h1>Not Found</h1><p>No portrait asset exists for ${escapeHtml(portraitId)}.</p>`, 404);
            return;
        }
        const requestedSeed = requestUrl.searchParams.get("seed");
        if (requestedSeed) {
            if (resolveStaffPortraitAssetId(requestedSeed) !== portraitId) {
                sendHtml(response, `<h1>Not Found</h1><p>Portrait seed does not match asset ${escapeHtml(portraitId)}.</p>`, 404);
                return;
            }
            await ensureStaffPortraitAsset(requestedSeed);
        }
        let assetSource = "";
        try {
            assetSource = await readStaffPortraitAsset(portraitId);
        }
        catch (error) {
            const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
            if (errorCode === "ENOENT") {
                sendHtml(response, `<h1>Not Found</h1><p>No portrait asset exists for ${escapeHtml(portraitId)}.</p>`, 404);
                return;
            }
            throw error;
        }
        response.writeHead(200, {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(assetSource);
        return;
    }
    const uiBrowserModuleMatch = pathname.match(/^\/([a-z0-9-]+)\.js$/i);
    if (request.method === "GET" && uiBrowserModuleMatch) {
        const moduleName = uiBrowserModuleMatch[1]?.toLowerCase() ?? "";
        const moduleUrl = uiBrowserModuleAssetUrls.get(moduleName);
        if (moduleUrl) {
            const moduleSource = await readFile(moduleUrl, "utf8");
            response.writeHead(200, {
                "content-type": "text/javascript; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(moduleSource);
            return;
        }
    }
    if (request.method === "GET" && pathname === "/") {
        await pageHandlers.handleLauncherPageRequest(response, requestUrl, flash);
        return;
    }
    if (request.method === "GET" && bootstrapMatch) {
        const saveId = decodeURIComponent(bootstrapMatch[1] ?? "");
        const requestedTab = normalizeShellTab(requestUrl.searchParams.get("tab"));
        await withUiTiming(`bootstrap save=${saveId} tab=${requestedTab}`, () => handleBootstrapApi(response, saveId, requestedTab));
        return;
    }
    if (request.method === "GET" && tabMatch) {
        const saveId = decodeURIComponent(tabMatch[1] ?? "");
        const tabId = normalizeShellTab(tabMatch[2] ?? "dashboard");
        await withUiTiming(`tab save=${saveId} tab=${tabId}`, () => handleTabApi(response, saveId, tabId));
        return;
    }
    if (request.method === "GET" && clockMatch && !clockMatch[2]) {
        const saveId = decodeURIComponent(clockMatch[1] ?? "");
        const selectedLocalDate = requestUrl.searchParams.get("selectedDate") ?? undefined;
        await withUiTiming(`clock save=${saveId}`, () => handleClockApi(response, saveId, selectedLocalDate));
        return;
    }
    if (request.method === "POST" && clockMatch) {
        const saveId = decodeURIComponent(clockMatch[1] ?? "");
        const clockAction = clockMatch[2] ?? "";
        const form = await readForm(request);
        switch (clockAction) {
            case "tick":
                await withUiTiming(`clock save=${saveId} action=tick`, () => handleClockTickApi(response, saveId, form));
                return;
            case "advance-to-calendar-anchor":
                await withUiTiming(`clock save=${saveId} action=advance-to-calendar-anchor`, () => handleClockAdvanceToCalendarAnchorApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown clock action ${clockAction}.` });
                return;
        }
    }
    if (request.method === "POST" && actionApiMatch) {
        const saveId = decodeURIComponent(actionApiMatch[1] ?? "");
        const actionName = actionApiMatch[2] ?? "";
        const form = await readForm(request);
        switch (actionName) {
            case "create-company":
                await withUiTiming(`action save=${saveId} name=create-company`, () => handleCreateCompanyApi(response, saveId, form));
                return;
            case "acquire-aircraft":
                await withUiTiming(`action save=${saveId} name=acquire-aircraft`, () => handleAcquireAircraftApi(response, saveId, form));
                return;
            case "acquire-aircraft-offer":
                await withUiTiming(`action save=${saveId} name=acquire-aircraft-offer`, () => handleAcquireAircraftOfferApi(response, saveId, form));
                return;
            case "add-staffing":
                await withUiTiming(`action save=${saveId} name=add-staffing`, () => handleAddStaffingApi(response, saveId, form));
                return;
            case "schedule-maintenance":
                await withUiTiming(`action save=${saveId} name=schedule-maintenance`, () => handleScheduleMaintenanceApi(response, saveId, form));
                return;
            case "hire-pilot-candidate":
                await withUiTiming(`action save=${saveId} name=hire-pilot-candidate`, () => handleHirePilotCandidateApi(response, saveId, form));
                return;
            case "start-pilot-training":
                await withUiTiming(`action save=${saveId} name=start-pilot-training`, () => handleStartPilotTrainingApi(response, saveId, form));
                return;
            case "start-pilot-transfer":
                await withUiTiming(`action save=${saveId} name=start-pilot-transfer`, () => handleStartPilotTransferApi(response, saveId, form));
                return;
            case "convert-pilot-to-direct-hire":
                await withUiTiming(`action save=${saveId} name=convert-pilot-to-direct-hire`, () => handleConvertPilotToDirectHireApi(response, saveId, form));
                return;
            case "dismiss-pilot":
                await withUiTiming(`action save=${saveId} name=dismiss-pilot`, () => handleDismissPilotApi(response, saveId, form));
                return;
            case "auto-plan-contract":
                await withUiTiming(`action save=${saveId} name=auto-plan-contract`, () => handleAutoPlanContractApi(response, saveId, form));
                return;
            case "commit-schedule":
                await withUiTiming(`action save=${saveId} name=commit-schedule`, () => handleCommitScheduleApi(response, saveId, form));
                return;
            case "discard-schedule-draft":
                await withUiTiming(`action save=${saveId} name=discard-schedule-draft`, () => handleDiscardScheduleDraftApi(response, saveId, form));
                return;
            case "advance-time":
                await withUiTiming(`action save=${saveId} name=advance-time`, () => handleAdvanceTimeApi(response, saveId, form));
                return;
            case "bind-route-plan":
                await withUiTiming(`action save=${saveId} name=bind-route-plan`, () => handleBindRoutePlanApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown action ${actionName}.` });
                return;
        }
    }
    if (request.method === "GET" && contractsViewMatch) {
        const saveId = decodeURIComponent(contractsViewMatch[1] ?? "");
        await withUiTiming(`contracts-view save=${saveId}`, () => handleContractsViewApi(response, saveId));
        return;
    }
    if (request.method === "POST" && contractsAcceptMatch) {
        const saveId = decodeURIComponent(contractsAcceptMatch[1] ?? "");
        const form = await readForm(request);
        await withUiTiming(`contracts-accept save=${saveId}`, () => handleAcceptContractApi(response, saveId, form));
        return;
    }
    if (request.method === "POST" && contractsCancelMatch) {
        const saveId = decodeURIComponent(contractsCancelMatch[1] ?? "");
        const form = await readForm(request);
        await withUiTiming(`contracts-cancel save=${saveId}`, () => handleCancelContractApi(response, saveId, form));
        return;
    }
    if (request.method === "POST" && contractsPlannerMatch) {
        const saveId = decodeURIComponent(contractsPlannerMatch[1] ?? "");
        const plannerAction = contractsPlannerMatch[2] ?? "";
        const form = await readForm(request);
        switch (plannerAction) {
            case "add":
                await withUiTiming(`contracts-planner save=${saveId} action=add`, () => handlePlannerAddApi(response, saveId, form));
                return;
            case "remove":
                await withUiTiming(`contracts-planner save=${saveId} action=remove`, () => handlePlannerRemoveApi(response, saveId, form));
                return;
            case "reorder":
                await withUiTiming(`contracts-planner save=${saveId} action=reorder`, () => handlePlannerReorderApi(response, saveId, form));
                return;
            case "clear":
                await withUiTiming(`contracts-planner save=${saveId} action=clear`, () => handlePlannerClearApi(response, saveId));
                return;
            case "accept":
                await withUiTiming(`contracts-planner save=${saveId} action=accept`, () => handlePlannerAcceptApi(response, saveId, form));
                return;
            default:
                sendJson(response, 404, { success: false, error: `Unknown planner action ${plannerAction}.` });
                return;
        }
    }
    if (request.method === "GET" && openSaveMatch) {
        await pageHandlers.handleOpenSavePageRequest(response, requestUrl, openSaveMatch);
        return;
    }
    if (request.method === "GET" && pathname.startsWith("/save/")) {
        await pageHandlers.handleSavePageRequest(response, requestUrl, pathname);
        return;
    }
    if (request.method === "POST") {
        const actionHandler = actionHandlers[pathname];
        if (!actionHandler) {
            const saveIds = await listSaveIds();
            sendNotFound(response, saveIds, `Unknown action ${pathname}.`);
            return;
        }
        const form = await readForm(request);
        await actionHandler(response, form);
        return;
    }
    const saveIds = await listSaveIds();
    sendNotFound(response, saveIds, `No route matched ${pathname}.`);
}
