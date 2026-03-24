// @ts-nocheck
export function createShellApiHandlers(deps) {
    const {
        backend,
        saveShellRenderers,
        buildBootstrapPayload,
        buildTabPayload,
        loadClockPanelPayload,
        resolveCalendarAnchorUtc,
        normalizeShellTab,
        sendJson,
        addMinutesIso,
        commandId,
    } = deps;

    async function buildBootstrapApiPayload(saveId, initialTab) {
        return buildBootstrapPayload(backend, saveId, initialTab);
    }

    async function buildTabApiPayload(saveId, tabId) {
        return buildTabPayload(backend, saveId, tabId, saveShellRenderers);
    }

    async function buildClockApiPayload(saveId, selectedLocalDate) {
        return loadClockPanelPayload(backend, saveId, selectedLocalDate);
    }

    async function sendShellActionResponse(response, saveId, tab, result) {
        const tabPayload = await buildTabApiPayload(saveId, tab);
        if (!tabPayload) {
            sendJson(response, 409, {
                success: false,
                error: result.error ?? "The save shell could not be reloaded.",
            });
            return;
        }
        sendJson(response, result.success ? 200 : 400, {
            success: result.success,
            message: result.message,
            error: result.error,
            notificationLevel: result.notificationLevel,
            shell: tabPayload.shell,
            tab: tabPayload,
        });
    }

    async function sendClockActionResponse(response, saveId, tab, selectedLocalDate, result, options = {}) {
        const [bootstrapPayload, clockPayload, tabPayload] = await Promise.all([
            buildBootstrapApiPayload(saveId, tab),
            buildClockApiPayload(saveId, selectedLocalDate),
            options.includeTab ? buildTabApiPayload(saveId, tab) : Promise.resolve(null),
        ]);
        if (!bootstrapPayload || !clockPayload) {
            sendJson(response, 409, {
                success: false,
                error: result.error ?? "The clock state could not be reloaded.",
            });
            return;
        }
        if (options.includeTab && !tabPayload) {
            sendJson(response, 409, {
                success: false,
                error: result.error ?? "The active tab could not be reloaded.",
                shell: bootstrapPayload.shell,
                clock: clockPayload,
            });
            return;
        }
        sendJson(response, result.success ? 200 : 400, {
            success: result.success,
            message: result.message,
            error: result.error,
            notificationLevel: result.notificationLevel,
            shell: tabPayload?.shell ?? bootstrapPayload.shell,
            tab: tabPayload ?? undefined,
            clock: clockPayload,
        });
    }

    async function handleBootstrapApi(response, saveId, requestedTab) {
        const payload = await buildBootstrapApiPayload(saveId, requestedTab);
        if (!payload) {
            sendJson(response, 404, { error: `Save ${saveId} was not found.` });
            return;
        }
        sendJson(response, 200, payload);
    }

    async function handleTabApi(response, saveId, tabId) {
        const payload = await buildTabApiPayload(saveId, tabId);
        if (!payload) {
            sendJson(response, 404, { error: `Save ${saveId} was not found.` });
            return;
        }
        sendJson(response, 200, payload);
    }

    async function handleClockApi(response, saveId, selectedLocalDate) {
        const payload = await buildClockApiPayload(saveId, selectedLocalDate);
        if (!payload) {
            sendJson(response, 404, { error: `Clock view for save ${saveId} is not available.` });
            return;
        }
        sendJson(response, 200, { payload });
    }

    async function handleClockTickApi(response, saveId, form) {
        const tab = normalizeShellTab(form.get("tab"));
        const selectedLocalDate = form.get("selectedLocalDate") ?? undefined;
        const companyContext = await backend.loadCompanyContext(saveId);
        if (!companyContext) {
            await sendClockActionResponse(response, saveId, tab, selectedLocalDate, {
                success: false,
                error: "Could not load the save company context.",
            });
            return;
        }
        const requestedMinutes = Number.parseInt(form.get("minutes") ?? "0", 10);
        const minutes = Number.isNaN(requestedMinutes) ? 0 : Math.max(0, Math.min(requestedMinutes, 24 * 60));
        if (minutes <= 0) {
            await sendClockActionResponse(response, saveId, tab, selectedLocalDate, {
                success: true,
            });
            return;
        }
        const targetTimeUtc = addMinutesIso(companyContext.currentTimeUtc, minutes);
        const result = await backend.dispatch({
            commandId: commandId("cmd_clock_tick_api"),
            saveId,
            commandName: "AdvanceTime",
            issuedAtUtc: new Date().toISOString(),
            actorType: "player",
            payload: {
                targetTimeUtc,
                stopConditions: ["target_time", "critical_alert"],
            },
        });
        const stoppedBecause = String(result.metadata?.stoppedBecause ?? "target_time");
        const includeTab = tab === "aircraft" && Boolean(result.metadata?.aircraftMarketChanged);
        await sendClockActionResponse(response, saveId, tab, selectedLocalDate, result.success
            ? {
                success: true,
                message: stoppedBecause !== "target_time" ? `Clock paused at ${String(result.metadata?.advancedToUtc ?? targetTimeUtc)} because ${stoppedBecause.replaceAll("_", " ")}.` : undefined,
                notificationLevel: stoppedBecause !== "target_time" ? "important" : undefined,
            }
            : {
                success: false,
                error: result.hardBlockers[0] ?? "Could not advance the simulation clock.",
            }, { includeTab });
    }

    async function handleClockAdvanceToCalendarAnchorApi(response, saveId, form) {
        const tab = normalizeShellTab(form.get("tab"));
        const localDate = form.get("localDate") ?? "";
        const clockPayload = await buildClockApiPayload(saveId, localDate || undefined);
        if (!clockPayload) {
            await sendClockActionResponse(response, saveId, tab, localDate || undefined, {
                success: false,
                error: "Clock view is not available for this save.",
            });
            return;
        }
        const targetTimeUtc = resolveCalendarAnchorUtc(localDate, "06:00", clockPayload.timeZone);
        if (Date.parse(targetTimeUtc) <= Date.parse(clockPayload.currentTimeUtc)) {
            await sendClockActionResponse(response, saveId, tab, localDate || undefined, {
                success: false,
                error: "Sim to the selected morning is not available for that day.",
            });
            return;
        }
        const result = await backend.dispatch({
            commandId: commandId("cmd_clock_anchor_api"),
            saveId,
            commandName: "AdvanceTime",
            issuedAtUtc: new Date().toISOString(),
            actorType: "player",
            payload: {
                targetTimeUtc,
                stopConditions: ["target_time", "critical_alert"],
            },
        });
        const stoppedBecause = String(result.metadata?.stoppedBecause ?? "target_time");
        const includeTab = tab === "aircraft" && Boolean(result.metadata?.aircraftMarketChanged);
        await sendClockActionResponse(response, saveId, tab, localDate, result.success
            ? {
                success: true,
                message: stoppedBecause === "target_time"
                    ? `Advanced to the selected morning on ${localDate}.`
                    : `Stopped before the selected morning on ${localDate} because ${stoppedBecause.replaceAll("_", " ")}.`,
                notificationLevel: stoppedBecause === "target_time" ? "routine" : "important",
            }
            : {
                success: false,
                error: result.hardBlockers[0] ?? "Could not advance to the selected calendar anchor.",
            }, { includeTab });
    }

    return {
        buildBootstrapApiPayload,
        buildTabApiPayload,
        buildClockApiPayload,
        sendShellActionResponse,
        sendClockActionResponse,
        handleBootstrapApi,
        handleTabApi,
        handleClockApi,
        handleClockTickApi,
        handleClockAdvanceToCalendarAnchorApi,
    };
}
