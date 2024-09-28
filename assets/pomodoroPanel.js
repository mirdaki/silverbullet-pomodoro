const timerDisplay = document.getElementById('timer');
const taskText = document.getElementById('task');
const timerToggleButton = document.getElementById('timer-toggle-button');
const timerResetButton = document.getElementById('timer-reset-button');
const timerSkipButton = document.getElementById('timer-skip-button');

// deno-lint-ignore no-unused-vars
function updatePanel(pomodoroPanelUpdate) {
    timerResetButton.addEventListener('click', resetTimer);
    timerSkipButton.addEventListener('click', skipStage);

    if (pomodoroPanelUpdate.panelState == 'waiting') {
        timerToggleButton.addEventListener('click', startTimer);
    } else {
        timerToggleButton.addEventListener('click', pauseTimer);
    }

    if (pomodoroPanelUpdate.task && pomodoroPanelUpdate.task.name != '') {
        taskText.textContent = pomodoroPanelUpdate.task.name;
    }

    timerToggleButton.textContent = pomodoroPanelUpdate.toggleButtonText;
    timerDisplay.textContent = timeInSecondsToText(pomodoroPanelUpdate.timeRemainingInSeconds)
}

function startTimer() {
    syscall("system.invokeFunction", "pomodoro.stateChange", "start");
}

function pauseTimer() {
    syscall("system.invokeFunction", "pomodoro.stateChange", "pause");
}

function resetTimer() {
    syscall("system.invokeFunction", "pomodoro.stateChange", "reset");
}

function skipStage() {
    syscall("system.invokeFunction", "pomodoro.stateChange", "skip");
}

function timeInSecondsToText(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;

    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
