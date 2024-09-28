import { parseQuery } from "@silverbulletmd/silverbullet/lib/parse_query";
import { asset, clientStore, datastore, editor, space, system } from "@silverbulletmd/silverbullet/syscalls";
import { FilterOption } from "@silverbulletmd/silverbullet/type/client";
import { z, ZodError } from "zod";

const PLUG_NAME = "pomodoro";
const POMODORO_LAST_OPEN = "pomodoroLastOpen";
const POMODORO_LAST_TASK = "pomodoroLastTask";

type Task = {
  name: string;
  ref: string;
}

type PomodoroType = "work" | "shortBreak" | "longBreak";

type PomodoroPanelState = "running" | "waiting";

type PomodoroAction = "start" | "skip" | "reset" | "pause" | "end" | "tick";

type PomodoroToggleButtonText = "Start" | "Pause" | "Resume";

type PomodoroGlobalState = {
  panelState: PomodoroPanelState;
  type: PomodoroType;
  currentButtonText: PomodoroToggleButtonText
  currentTask: Task | null;
  countForLongBreak: number;
  timerIntervalId: number,
  timeRemainingInSeconds: number,
  panelOpen: boolean,
}

type PomodoroPanelUpdate = {
  panelState: PomodoroPanelState;
  task: Task | null;
  toggleButtonText: PomodoroToggleButtonText
  timeRemainingInSeconds: number;
}

let pomodoroConfig: PomodoroConfig;
let pomodoroState: PomodoroGlobalState;

// User facing functions
export async function togglePomodoroPanel() {
  pomodoroState.panelOpen = !pomodoroState.panelOpen;
  await clientStore.set(POMODORO_LAST_OPEN, pomodoroState.panelOpen);

  if (pomodoroState.panelOpen) {
    await updatePomodoroPanel(pomodoroStateToPanelUpdate(pomodoroState));
  } else {
    await editor.hidePanel(pomodoroConfig.position);
  }
}

export async function chooseTask() {
  const parsedQuery = await parseQuery(pomodoroConfig.taskQuery);
  parsedQuery.distinct = true;
  const queryResults = await datastore.query(parsedQuery)
  const filterInput: FilterOption[] = queryResults.map((task) => ({
    name: task.value.name,
    description: task.value.ref
  }));

  const chosenResult = await editor.filterBox("Focus task", filterInput);
  const task: Task = {
    name: chosenResult?.name ?? chosenResult?.baseName ?? "",
    ref: chosenResult?.description ?? "",
  };
  pomodoroState.currentTask = task;

  await updatePomodoroPanel(pomodoroStateToPanelUpdate(pomodoroState));
}


// API
// deno-lint-ignore no-unused-vars
export async function initializePlug() {
  if (!pomodoroConfig) {
    pomodoroConfig = await getPlugConfig();
  }

  if (!pomodoroState) {
    pomodoroState = {
      panelState: "waiting",
      type: "work",
      currentButtonText: "Start",
      currentTask: null,
      countForLongBreak: pomodoroConfig.countForLongBreak,
      timerIntervalId: 0,
      timeRemainingInSeconds: pomodoroConfig.workTime,
      panelOpen: false,
    };
  }

  pomodoroState.currentTask = await clientStore.get(POMODORO_LAST_TASK);

  // This will determine if the panel is open or not on startup
  if (await clientStore.get(POMODORO_LAST_OPEN)) {
    await togglePomodoroPanel();
  }
}

export async function stateChange(action: PomodoroAction) {
  if (pomodoroState.panelState === "waiting") {
    if (action === "start") {
      runTimerWithPomodoroState();
      pomodoroState.panelState = "running";
      pomodoroState.currentButtonText = "Pause";

    } else if (action === "reset") {
      clearInterval(pomodoroState.timerIntervalId);

      if (pomodoroState.type === "work") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
      } else if (pomodoroState.type === "shortBreak") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.shortBreakTime;
      } else if (pomodoroState.type === "longBreak") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.longBreakTime;
      }

    } else if (action === "skip") {
      clearInterval(pomodoroState.timerIntervalId);
      if (pomodoroState.type === "work") {
        pomodoroState.countForLongBreak--;

        if (pomodoroState.countForLongBreak <= 0) {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.longBreakTime;
          pomodoroState.type = "longBreak";
          pomodoroState.countForLongBreak = pomodoroConfig.countForLongBreak;
        } else {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.shortBreakTime;
          pomodoroState.type = "shortBreak";
        }
      } else {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
        pomodoroState.type = "work";
      }
    }
  } else if (pomodoroState.panelState === "running") {
    if (action === "tick") {
      // The time remaining is set from the `runTimerWithPomodoroState` function

    } else if (action === "pause") {
      clearInterval(pomodoroState.timerIntervalId);
      pomodoroState.panelState = "waiting";
      pomodoroState.currentButtonText = "Resume";

    } else if (action === "end") {
      clearInterval(pomodoroState.timerIntervalId);

      if (pomodoroState.type === "work") {
        await updatePomodoroFile("work", pomodoroState.currentTask);
        pomodoroState.countForLongBreak--;

        if (pomodoroState.countForLongBreak <= 0) {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.longBreakTime;
          pomodoroState.type = "longBreak";
          pomodoroState.countForLongBreak = pomodoroConfig.countForLongBreak;
        } else {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.shortBreakTime;
          pomodoroState.type = "shortBreak";
        }

      } else if (pomodoroState.type === "shortBreak") {
        await updatePomodoroFile("shortBreak");
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
        pomodoroState.type = "work";

      } else if (pomodoroState.type === "longBreak") {
        await updatePomodoroFile("longBreak");
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
        pomodoroState.type = "work";
      }

      pomodoroState.panelState = "waiting";
      pomodoroState.currentButtonText = "Start";
      await editor.flashNotification("Pomodoro ended!");

    } else if (action === "reset") {
      clearInterval(pomodoroState.timerIntervalId);

      if (pomodoroState.type === "work") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
      } else if (pomodoroState.type === "shortBreak") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.shortBreakTime;
      } else if (pomodoroState.type === "longBreak") {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.longBreakTime;
      }
      runTimerWithPomodoroState();

    } else if (action === "skip") {
      clearInterval(pomodoroState.timerIntervalId);
      pomodoroState.panelState = "waiting";
      pomodoroState.currentButtonText = "Start";

      if (pomodoroState.type === "work") {
        pomodoroState.countForLongBreak--;

        if (pomodoroState.countForLongBreak <= 0) {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.longBreakTime;
          pomodoroState.type = "longBreak";
          pomodoroState.countForLongBreak = pomodoroConfig.countForLongBreak;
        } else {
          pomodoroState.timeRemainingInSeconds = pomodoroConfig.shortBreakTime;
          pomodoroState.type = "shortBreak";
        }
      } else {
        pomodoroState.timeRemainingInSeconds = pomodoroConfig.workTime;
        pomodoroState.type = "work";
      }
    }
  }
  updatePomodoroPanel(pomodoroStateToPanelUpdate(pomodoroState));
}


// Config
/**
 * The possible position where the panel can be rendered.
 */
type PomodoroConfig = z.infer<typeof pomodoroConfigSchema>;

const POSITIONS = ["rhs", "lhs", "bhs", "modal"] as const;

const pomodoroConfigSchema = z.object({
  /**
   * Where to position the panel in the UI.
   */
  position: z.enum(POSITIONS).optional().default("rhs"),

  /**
   * The size of the panel.
   */
  size: z.number().gt(0).lt(1).optional().default(.4),

  /**
   * The page to use to store pomodoro data.
   */
  page: z.string().optional().default("_POMODORO"),

  /**
   * The time in minutes for a work session.
   */
  workTime: z.number().gt(0).optional().default(25),

  /**
   * The time in minutes for a short break.
   */
  shortBreakTime: z.number().gt(0).optional().default(5),

  /**
   * The time in minutes for a long break.
   */
  longBreakTime: z.number().gt(0).optional().default(30),

  /**
   * The number of work sessions before a long break.
   */
  countForLongBreak: z.number().gt(0).optional().default(4),

  /**
   * The query to use to get tasks listed by the `🍅 Pomodoro: Choose Task` command.
   */
  taskQuery: z.string().optional().default("task where done = false"),
});

let configErrorShown = false;

async function showConfigErrorNotification(error: unknown) {
  if (configErrorShown) {
    return;
  }

  configErrorShown = true;
  let errorMessage = `${typeof error}: ${String(error)}`;

  if (error instanceof ZodError) {
    const { formErrors, fieldErrors } = error.flatten();
    const fieldErrorMessages = Object.keys(fieldErrors).map((field) =>
      `\`${field}\` - ${fieldErrors[field]!.join(", ")}`
    );

    // Not pretty, but we don't have any formatting options available here.
    errorMessage = [...formErrors, ...fieldErrorMessages].join("; ");
  }

  // Some rudimentary notification about an invalid configuration.
  // Not pretty, but we can't use html/formatting here.
  await editor.flashNotification(
    `There was an error with your ${PLUG_NAME} configuration. Check your SETTINGS file: ${errorMessage}`,
    "error",
  );
}

async function getPlugConfig(): Promise<PomodoroConfig> {
  const userConfig = await system.getSpaceConfig(PLUG_NAME);
  let finalConfig: PomodoroConfig;
  console.log(userConfig);

  try {
    finalConfig = pomodoroConfigSchema.parse(userConfig || {});
  } catch (_err) {
    if (!configErrorShown) {
      showConfigErrorNotification(_err);
      configErrorShown = true;
    }
    // Fallback to the default configuration
    finalConfig = pomodoroConfigSchema.parse({});
  }
  finalConfig.workTime = finalConfig.workTime * 60;
  finalConfig.shortBreakTime = finalConfig.shortBreakTime * 60;
  finalConfig.longBreakTime = finalConfig.longBreakTime * 60;
  console.log(finalConfig);
  return finalConfig;
}

// Utilities
async function updatePomodoroPanel(panelUpdate: PomodoroPanelUpdate) {
  // Save the state for reopening the panel
  await clientStore.set(POMODORO_LAST_TASK, panelUpdate.task);

  // If it's not visible, don't update and reopen it
  if (!pomodoroState.panelOpen) {
    return;
  }

  const pomodoroHtml = await asset.readAsset(PLUG_NAME, "assets/pomodoroPanel.html");
  const pomodoroJs = await asset.readAsset(PLUG_NAME, "assets/pomodoroPanel.js");
  await editor.showPanel(pomodoroConfig.position, pomodoroConfig.size, pomodoroHtml,
    `
      ${pomodoroJs}
      updatePanel(${JSON.stringify(panelUpdate)});
    `,);
};

async function updatePomodoroFile(type: PomodoroType, task: Task | null = null) {
  let pageText = "";
  try {
    pageText = await space.readPage(pomodoroConfig.page);
  } catch {
    console.log("Pomodoro page not found, creating new one");
    pageText =
      `---
tags: pomodoro
---

`;
  }

  const dateText = new Date().toISOString().split('T')[0];
  let updatedLine = `- Work [date: "${dateText}"] [pomodoroType: work]`;
  if (type == "work" && task) {
    updatedLine = `- ${task?.name} [date: "${dateText}"] [taskRef: ${task?.ref}] [pomodoroType: work]`;
  } else if (type === "shortBreak") {
    updatedLine = `- Short Break [date: "${dateText}"] [pomodoroType: shortBreak]`;;
  } else if (type === "longBreak") {
    updatedLine = `- Long Break [date: "${dateText}"] [pomodoroType: longBreak]`;;
  }

  const lines = pageText.split('\n');
  let foundLineFlag = false;

  // Start from the bottom is possibly an unnecessary optimization, but it makes sense
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line.startsWith(updatedLine)) {
      const match = line.match(/\[iteration: (\d+)\]/);
      if (match) {
        updatedLine += ` [iteration: ${parseInt(match[1]) + 1}]`;
        lines[index] = updatedLine;
      }
      foundLineFlag = true;
      break;
    }
  }

  let replaceText = "";
  if (foundLineFlag) {
    replaceText = lines.join('\n');
  } else {
    replaceText = pageText + updatedLine + ' [iteration: 1]\n';
  }

  await space.writePage(pomodoroConfig.page, replaceText);
}

function pomodoroStateToPanelUpdate(state: PomodoroGlobalState): PomodoroPanelUpdate {
  return {
    panelState: state.panelState,
    task: state.currentTask,
    toggleButtonText: state.currentButtonText,
    timeRemainingInSeconds: state.timeRemainingInSeconds,
  };
}

function runTimerWithPomodoroState() {
  pomodoroState.timerIntervalId = setInterval(async () => {
    if (pomodoroState.timeRemainingInSeconds <= 0) {
      await stateChange("end");
    } else {
      pomodoroState.timeRemainingInSeconds--;
    }
    await stateChange("tick");
  }, 1000);
}
