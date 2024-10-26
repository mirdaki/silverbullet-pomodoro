const timerDisplay = document.getElementById('timer');
const taskText = document.getElementById('task');
const taskButton = document.getElementById('task-button');
const timerToggleButton = document.getElementById('timer-toggle-button');
const timerResetButton = document.getElementById('timer-reset-button');
const timerSkipButton = document.getElementById('timer-skip-button');

// deno-lint-ignore no-unused-vars
function updatePanel(pomodoroPanelUpdate) {
    taskButton.addEventListener('click', chooseTask);
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

    // Can only play audio in the context of a browser window, so setting it here
    if (pomodoroPanelUpdate.timeRemainingInSeconds == 0) {
        new Audio(pomodoroPanelUpdate.audioAlertPath).play();
    }
}

function chooseTask() {
    syscall("system.invokeFunction", "pomodoro.chooseTask");
}

function startTimer() {
    syscall("system.invokeFunction", "pomodoro.toggleTimer");
}

function pauseTimer() {
    syscall("system.invokeFunction", "pomodoro.toggleTimer");
}

function resetTimer() {
    syscall("system.invokeFunction", "pomodoro.resetTimer");
}

function skipStage() {
    syscall("system.invokeFunction", "pomodoro.skipTimer");
}

function timeInSecondsToText(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;

    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
