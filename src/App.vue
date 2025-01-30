<template>
  <div class="app">
    <div class="top-bar" v-show="showUI">
      <button class="play-button" @click="togglePlay">
        <img v-if="!isPlaying" src="/play.svg" alt="Play" />
        <img v-else src="/stop.svg" alt="Stop" />
      </button>
      <div class="top-bar-spacer"></div>
      <div class="username-container">
        <input
          v-model="username"
          :class="['username-input', { editing: isEditingUsername }]"
          @keyup.enter="saveUsername"
          @blur="saveUsername"
          @focus="editUsername"
          :placeholder="'set username'"
          ref="usernameInput"
        />
      </div>
      <div class="ip-container">
        <div
          class="user-color top-color"
          :style="{ backgroundColor: userColor }"
        ></div>
        <span class="ip-text">{{ myIP }}</span>
      </div>
      <span class="time">{{ time }}</span>
      <button class="help-button" @click="showHelp = true">
        <img src="/help.svg" alt="Help" />
      </button>
    </div>
    <div class="editor">
      <div class="ace-editor-container">
        <div
          ref="editor"
          class="ace-editor"
          style="width: 100%; height: 100%"
        ></div>
      </div>
    </div>
    <div class="user-list" v-show="showUI">
      <div v-for="user in users" :key="user.id" class="user-item">
        <div
          class="user-color"
          :style="{ backgroundColor: user.color }"
          :title="user.ip"
        ></div>
        <span class="username">{{ user.name }}</span>
      </div>
    </div>
    <HelpModal :show="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup>
import "./style.css";
import { ref, onMounted, onUnmounted, nextTick, watch } from "vue";
import { v4 as uuidv4 } from "uuid";
import ace from "ace-builds";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-monokai";
import * as Tone from "tone";
import HelpModal from "./components/HelpModal.vue";

// Active loops and synths for cleanup
const activeLoops = new Map();
const activeSynths = new Map();

// Synth types and their configurations
const synthTypes = {
  pulse: {
    create: () => {
      const osc = new Tone.PulseOscillator().toDestination();
      osc.volume.value = -12; // Base volume
      return osc;
    },
    params: (vol = 1, rate = 1) => ({
      volume: (vol / 9) * 24 - 12, // Scale 0-9 to -12 to +12 dB
      frequency: rate,
    }),
    trigger: async (synth, config, duration) => {
      // Start audio context if needed
      await Tone.start();

      // Set volume
      synth.volume.value = config.volume;

      // Create a repeating trigger
      const loop = new Tone.Loop((time) => {
        synth.start(time).stop(time + 0.1); // 100ms pulse
      }, 1 / config.frequency).start(0);

      // Stop after duration
      if (duration) {
        Tone.Transport.scheduleOnce(() => {
          loop.stop();
          synth.stop();
        }, `+${duration}`);
      }

      // Start transport if not running
      if (Tone.Transport.state !== "started") {
        Tone.Transport.start();
      }

      return loop;
    },
  },
  fm: {
    create: () => new Tone.FMSynth().toDestination(),
    params: (vol = 1, modIndex = 5, ratio = 1) => ({
      volume: vol,
      modulationIndex: modIndex,
      harmonicity: ratio,
    }),
  },
  am: {
    create: () => new Tone.AMSynth().toDestination(),
    params: (vol = 1, depth = 1, ratio = 1) => ({
      volume: vol,
      modulationDepth: depth,
      harmonicity: ratio,
    }),
  },
  karplus: {
    create: () => new Tone.PluckSynth().toDestination(),
    params: (vol = 1, decay = 0.5) => ({ volume: vol, attackNoise: decay }),
  },
  noise: {
    create: (type = "white") => new Tone.Noise(type).toDestination(),
    params: (vol = 1) => ({ volume: vol }),
  },
  grain: {
    create: () => new Tone.GrainPlayer().toDestination(),
    params: (vol = 1, speed = 1, density = 10) => ({
      volume: vol,
      playbackRate: speed,
      grainSize: density,
    }),
  },
};

const users = ref([]);
const time = ref("00:00:00");
const username = ref("");
const isPlaying = ref(false);
const code = ref("");
const isEditingUsername = ref(false);
const showUI = ref(true);
const myIP = ref("connecting...");
const showHelp = ref(false);

const serverIP =
  window.location.hostname === "localhost"
    ? "localhost"
    : window.location.hostname;
const ws = new WebSocket(`ws://${serverIP}:3003`);

ws.onopen = () => {
  // Send initial join when connection is established
  sendMessage({
    type: "join",
    user: {
      id: userId.value,
      name: username.value || "Anonymous",
      color: userColor.value,
    },
  });
};

const togglePlay = () => {
  isPlaying.value = !isPlaying.value;
  sendMessage({ type: isPlaying.value ? "start" : "stop" });
};

const editUsername = () => {
  isEditingUsername.value = true;
  nextTick(() => {
    if (usernameInput.value) {
      usernameInput.value.focus();
    }
  });
};

const saveUsername = () => {
  isEditingUsername.value = false;
  if (username.value.trim()) {
    const user = users.value.find((u) => u.id === userId.value);
    if (user) {
      // Update existing user
      sendMessage({
        type: "update",
        user: {
          id: userId.value,
          name: username.value,
          color: userColor.value,
        },
      });
    } else {
      // New user
      sendMessage({
        type: "join",
        user: {
          id: userId.value,
          name: username.value,
          color: userColor.value,
        },
      });
    }
  }
};

const editor = ref(null);
const usernameInput = ref(null);
const userId = ref(uuidv4());
const userColor = ref(`hsl(${Math.random() * 360}, 100%, 50%)`);
let aceEditor = null;
const commandHistory = ref([]);
let historyIndex = ref(-1);
let currentCommand = ref("");

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "users") {
    users.value = data.users.filter((u) => u.name.trim() !== "");
    const currentUser = users.value.find((u) => u.id === userId.value);
    if (currentUser) {
      myIP.value = currentUser.ip;
      if (!username.value) {
        username.value = currentUser.name;
      }
    }
  }
  if (data.type === "time") {
    time.value = data.time;
  }
  if (data.type === "start") {
    isPlaying.value = true;
  }
  if (data.type === "stop") {
    isPlaying.value = false;
  }
  if (data.type === "synth") {
    handleSynthCommand(data.command, data.source);
  }
};

// Parse and execute synth commands
const handleSynthCommand = async (command, source) => {
  try {
    const match = command.match(
      /^(\w+)\(([\d,.\s]*)\)(?:\.(\d+)s)?(?:\.(\w+))?$/
    );
    if (!match) return;

    const [_, type, paramsStr, duration, dest] = match;
    const params = paramsStr.split(",").map(Number);
    const targetUser = dest || "local";
    const durationSecs = duration ? parseFloat(duration) : null;

    // Only process if command is for us or broadcast
    if (targetUser !== "local" && targetUser !== username.value) return;

    if (type in synthTypes) {
      // Create synth instance
      const synth = synthTypes[type].create();
      const config = synthTypes[type].params(...params);

      // Generate unique key for this synth
      const synthKey = `${source || userId.value}_${Date.now()}`;

      // Clean up any existing synth with same key
      if (activeSynths.has(synthKey)) {
        const oldSynth = activeSynths.get(synthKey);
        oldSynth.stop();
        activeSynths.delete(synthKey);
      }
      if (activeLoops.has(synthKey)) {
        const oldLoop = activeLoops.get(synthKey);
        oldLoop.stop();
        activeLoops.delete(synthKey);
      }

      // Store new synth
      activeSynths.set(synthKey, synth);

      // Handle synth-specific triggering
      if (synthTypes[type].trigger) {
        const loop = await synthTypes[type].trigger(
          synth,
          config,
          durationSecs
        );
        if (loop) activeLoops.set(synthKey, loop);
      } else {
        // Default behavior for other synths
        Object.entries(config).forEach(([key, value]) => {
          if (key === "volume") {
            synth.volume.value = (value / 9) * 24 - 12; // Scale volume
          } else if (key in synth) {
            synth[key] = value;
          }
        });

        if (synth.start) {
          synth.start();
        } else if (synth.triggerAttack) {
          synth.triggerAttack(config.frequency || 440);
        }

        if (durationSecs) {
          setTimeout(() => {
            if (synth.stop) {
              synth.stop();
            } else if (synth.triggerRelease) {
              synth.triggerRelease();
            }
            activeSynths.delete(synthKey);
          }, durationSecs * 1000);
        }
      }
    }
  } catch (err) {
    console.error("Error executing synth command:", err);
  }
};

// Send synth command
const sendSynthCommand = (command) => {
  sendMessage({
    type: "synth",
    command,
    source: userId.value,
  });
};

const sendMessage = (message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const handleKeyDown = (e) => {
  if (e.ctrlKey) {
    if (e.key === "p") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "0") {
      e.preventDefault();
      sendMessage({ type: "reset" });
    } else if (e.key === "h") {
      e.preventDefault();
      aceEditor.setValue("");
      aceEditor.clearSelection();
    }
  }
};

onMounted(async () => {
  const editorElement = editor.value;
  aceEditor = ace.edit(editorElement);
  aceEditor.on("change", () => {
    code.value = aceEditor.getValue();
  });
  aceEditor.setTheme("ace/theme/monokai");
  aceEditor.session.setMode("ace/mode/javascript");
  aceEditor.setValue(
    `Welcome to Kimi Synth!

Command Format: synthType(param1,param2,...).duration.destination

Examples:
pulse(4,1).4s.kimi     → Pulse wave at vol=4, 1Hz for 4s
fm(3,5,2)              → FM synth, vol=3, modIndex=5, ratio=2
am(2,0.5,1).2s         → AM synth, vol=2, depth=0.5, ratio=1
karplus(5,20)          → Karplus-Strong pluck, vol=5, decay=20ms
noise(6,white).3s      → White noise, vol=6 for 3s
grain(3,2,5)           → Granular synth, vol=3, speed=2, density=5

Evaluate with Ctrl+Enter`
  );
  aceEditor.setOptions({
    fontSize: "20px",
    showPrintMargin: false,
    showGutter: false,
    wrap: true,
    tabSize: 2,
    useWorker: false,
  });

  // Remove default keybindings
  aceEditor.commands.bindKeys({
    "ctrl-p": null,
    "ctrl-f": null,
    "ctrl-h": null,
    "ctrl-g": null,
    "ctrl-l": null,
    "ctrl-k": null,
    "ctrl-u": null,
    "ctrl-t": null,
    "ctrl-w": null,
    "alt-w": null,
    "ctrl-y": null,
    "alt-y": null,
    "ctrl-o": null,
    "ctrl-j": null,
    "ctrl-m": null,
    "ctrl-[": null,
    "ctrl-]": null,
    "ctrl-/": null,
    "ctrl-\\": null,
    "ctrl-a": null,
    "ctrl-d": null,
    "ctrl-e": null,
    "ctrl-n": null,
    "ctrl-r": null,
    "ctrl-s": null,
    "ctrl-v": null,
    "ctrl-x": null,
    "ctrl-z": null,
  });

  aceEditor.container.style.backgroundColor = "transparent";
  aceEditor.renderer.setStyle("background-color", "transparent");

  window.addEventListener("keydown", handleKeyDown);

  aceEditor.commands.addCommand({
    name: "evaluateCode",
    bindKey: { win: "Ctrl-Enter", mac: "Ctrl-Enter" },
    exec: () => {
      const selectedText = aceEditor.getSelectedText();
      const codeToEvaluate = selectedText || aceEditor.getValue();
      addToHistory(codeToEvaluate);
      sendSynthCommand(codeToEvaluate);
    },
  });

  aceEditor.commands.addCommand({
    name: "previousCommand",
    bindKey: { win: "Ctrl-Up", mac: "Ctrl-Up" },
    exec: () => {
      if (historyIndex.value > 0) {
        if (historyIndex.value === commandHistory.value.length) {
          currentCommand.value = aceEditor.getValue();
        }
        historyIndex.value--;
        aceEditor.setValue(commandHistory.value[historyIndex.value]);
        aceEditor.clearSelection();
      }
    },
  });

  aceEditor.commands.addCommand({
    name: "nextCommand",
    bindKey: { win: "Ctrl-Down", mac: "Ctrl-Down" },
    exec: () => {
      if (historyIndex.value < commandHistory.value.length) {
        historyIndex.value++;
        if (historyIndex.value === commandHistory.value.length) {
          aceEditor.setValue(currentCommand.value);
        } else {
          aceEditor.setValue(commandHistory.value[historyIndex.value]);
        }
        aceEditor.clearSelection();
      }
    },
  });
});

onUnmounted(() => {
  if (aceEditor) {
    aceEditor.destroy();
  }
  ws.close();
  window.removeEventListener("keydown", handleKeyDown);

  // Clean up any active synths and loops
  activeSynths.forEach((synth) => {
    if (synth.stop) synth.stop();
  });
  activeLoops.forEach((loop) => {
    if (loop.stop) loop.stop();
  });
  if (Tone.Transport.state === "started") {
    Tone.Transport.stop();
  }
});

const addToHistory = (content) => {
  if (
    content.trim() &&
    commandHistory.value[commandHistory.value.length - 1] !== content
  ) {
    commandHistory.value.push(content);
    historyIndex.value = commandHistory.value.length;
  }
};
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: black;
}

.top-bar {
  display: flex;
  align-items: center;
  padding: 10px;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  z-index: 1000;
}

.play-button,
.help-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-right: 10px;
}

.play-button img,
.help-button img {
  height: 20px;
}

.help-button {
  margin-left: 10px;
}

.username-container {
  margin-left: auto;
  margin-right: 10px;
  cursor: pointer;
}

.username-input {
  background: transparent;
  border: none;
  color: white;
  font-size: 1em;
  padding: 2px 5px;
  outline: none;
  width: 120px;
}

.username-input.editing {
  background: rgba(50, 50, 50, 0.8);
  border-radius: 4px;
}

.user-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 5px;
  position: relative;
}

.ip-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 10px;
}

.ip-text {
  font-size: 12px;
  color: #aaa;
  min-width: 80px;
}

.time {
  margin-right: 10px;
}

.editor {
  flex-grow: 1;
  overflow: hidden;
  height: 100%;
  background-color: transparent;
}

.ace-editor-container {
  width: 100%;
  height: 100%;
  background-color: transparent;
}

.ace-editor {
  background-color: transparent;
}

:deep(.ace_gutter),
:deep(.ace_content),
:deep(.ace_scroller) {
  background-color: transparent !important;
}

.user-list {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  border-radius: 8px;
  backdrop-filter: blur(10px);
  z-index: 1000;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
}
</style>
